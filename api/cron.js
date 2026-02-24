import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({
        credential: cert(serviceAccount)
    });
}

const db = getFirestore();
const messaging = getMessaging();

export default async function handler(req, res) {
    if (req.query.key !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const now = new Date();
        
        // 1. Calculate the "Target Time" (10 minutes from now)
        // We want to find tasks scheduled for roughly "Now + 10 mins"
        const tenMinutesFromNow = new Date(now.getTime() + 10 * 60000);

        // 2. Define a small "window" to catch tasks
        // Because cron jobs run every minute, we look for tasks scheduled 
        // between "9 minutes from now" and "11 minutes from now" to be safe.
        const startWindow = new Date(tenMinutesFromNow.getTime() - 60000); // 9 mins from now
        const endWindow = new Date(tenMinutesFromNow.getTime() + 60000);   // 11 mins from now

        // 3. Query Firestore
        const snapshot = await db.collection('userSchedules')
            .where('scheduledTime', '>=', startWindow.toISOString())
            .where('scheduledTime', '<=', endWindow.toISOString())
            .where('status', '==', 'pending') // Ensure we haven't sent it yet
            .get();

        if (snapshot.empty) {
            return res.status(200).json({ message: 'No tasks due in 10 mins.' });
        }

        // 4. Send Notifications
        const promises = snapshot.docs.map(async (doc) => {
            const task = doc.data();
            const tokenDoc = await db.collection('deviceTokens').doc(task.deviceId).get();
            
            if (tokenDoc.exists) {
                await messaging.send({
                    token: tokenDoc.data().token,
                    notification: {
                        title: "Upcoming Task (10m)", 
                        body: `Heads up! ${task.title} starts in 10 minutes.`
                    }
                });

                // Mark as sent so we don't alert them again
                await doc.ref.update({ status: 'sent', sentAt: now.toISOString() });
            }
        });

        await Promise.all(promises);
        return res.status(200).json({ success: true, processed: snapshot.size });

    } catch (error) {
        console.error("Error:", error);
        return res.status(500).json({ error: error.message });
    }
}