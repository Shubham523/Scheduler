// api/cron.js
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

// 1. Initialize Firebase Admin safely
// We check if it's already initialized to prevent hot-reload errors
if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({
        credential: cert(serviceAccount)
    });
}

const db = getFirestore();
const messaging = getMessaging();

export default async function handler(req, res) {
    // 2. Security: Prevent random people from visiting this URL
    // We will set this secret in Vercel later
    if (req.query.key !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // 3. Get Current Time (UTC is best for backend logic)
        const now = new Date();
        
        // 4. Query Firestore: Find tasks that are due right now or in the past
        // AND haven't been sent yet.
        // Note: Make sure your Firestore dates are stored as standard ISO strings or Timestamps
        const snapshot = await db.collection('userSchedules')
            .where('scheduledTime', '<=', now.toISOString()) 
            .where('status', '==', 'pending')
            .get();

        if (snapshot.empty) {
            return res.status(200).json({ message: 'No tasks due right now.' });
        }

        console.log(`Found ${snapshot.size} tasks to process.`);

        // 5. Loop through tasks and send notifications
        const promises = snapshot.docs.map(async (doc) => {
            const task = doc.data();
            
            // Get the device token for this user
            const tokenDoc = await db.collection('deviceTokens').doc(task.deviceId).get();
            
            if (!tokenDoc.exists) {
                console.log(`No token found for device: ${task.deviceId}`);
                return; 
            }

            const fcmToken = tokenDoc.data().token;

            // Send via FCM
            try {
                await messaging.send({
                    token: fcmToken,
                    notification: {
                        title: "LifeSync Alert",
                        body: `It's time for: ${task.title}`
                    }
                });

                // Mark as 'sent' so we don't spam the user
                await doc.ref.update({ status: 'sent', sentAt: new Date().toISOString() });
                
            } catch (error) {
                console.error(`Failed to send to ${task.deviceId}:`, error);
                // Optional: Mark as 'failed' if token is invalid
            }
        });

        // Wait for all notifications to be sent
        await Promise.all(promises);

        return res.status(200).json({ success: true, processed: snapshot.size });

    } catch (error) {
        console.error("Cron Job Error:", error);
        return res.status(500).json({ error: error.message });
    }
}