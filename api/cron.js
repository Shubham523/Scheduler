import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const messaging = getMessaging();

export default async function handler(req, res) {
    if (req.query.key !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const now = new Date();
        // Offset for IST (UTC + 5:30)
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istNow = new Date(now.getTime() + istOffset);
        
        // Target: Exactly 10 minutes from now
        const targetTime = new Date(istNow.getTime() + 10 * 60000);
        
        const hours = targetTime.getUTCHours();
        const minutes = targetTime.getUTCMinutes();
        
        // Format for matching the 'start' string (HH:mm)
        const searchTimeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        
        // Format for the optimized query (integer minutes from midnight)
        const targetMinutesTotal = (hours * 60) + minutes;

        const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const currentDay = daysOfWeek[targetTime.getUTCDay()];

        // Date string for deduplication (YYYY-MM-DD in IST)
        const dateStr = `${targetTime.getUTCFullYear()}-${(targetTime.getUTCMonth()+1).toString().padStart(2,'0')}-${targetTime.getUTCDate().toString().padStart(2,'0')}`;

        // --- OPTIMIZATION START ---
        const snapshot = await db.collection('userSchedules')
            .where("activeMinutes", "array-contains", targetMinutesTotal)
            .get();
        // --- OPTIMIZATION END ---

        if (snapshot.empty) {
            return res.status(200).json({ success: true, message: "No relevant schedules found for this minute." });
        }

        let notificationsSent = 0;
        let skippedDuplicates = 0;
        const promises = [];

        for (const userDoc of snapshot.docs) {
            const deviceId = userDoc.id;
            const userData = userDoc.data();
            const events = userData.events || [];

            for (const event of events) {
                const isTimeMatch = event.start === searchTimeStr;
                const isDayMatch = event.days && event.days.includes(currentDay);

                if (isTimeMatch && isDayMatch) {
                    // Deduplication: Check if we already notified for this event today
                    const dedupKey = `${deviceId}_${event.id || event.title}_${searchTimeStr}_${dateStr}`;
                    const dedupRef = db.collection('sentNotifications').doc(dedupKey);
                    const dedupDoc = await dedupRef.get();

                    if (dedupDoc.exists) {
                        skippedDuplicates++;
                        continue; // Already sent this notification today
                    }

                    const venueText = event.venue ? ` at ${event.venue}` : "";
                    
                    const tokenPromise = db.collection('deviceTokens').doc(deviceId).get()
                        .then(async (tokenDoc) => {
                            if (!tokenDoc.exists || !tokenDoc.data().token) return;
                            
                            try {
                                await messaging.send({
                                    token: tokenDoc.data().token,
                                    notification: {
                                        title: "LifeSync: Upcoming Task", 
                                        body: `${event.title} starts in 10 minutes (${event.start})${venueText}.`
                                    },
                                    webpush: {
                                        notification: {
                                            icon: "https://scheduler-ten-tan.vercel.app/vite.svg", 
                                            requireInteraction: true, 
                                        },
                                        fcmOptions: { link: "https://scheduler-ten-tan.vercel.app" }
                                    }
                                });
                                notificationsSent++;

                                // Mark as sent (auto-expires after 24h via TTL or manual cleanup)
                                await dedupRef.set({
                                    sentAt: new Date(),
                                    deviceId,
                                    eventTitle: event.title,
                                    time: searchTimeStr
                                });
                            } catch (sendError) {
                                if (sendError.code === 'messaging/registration-token-not-registered') {
                                    await db.collection('deviceTokens').doc(deviceId).delete();
                                }
                            }
                        });
                    promises.push(tokenPromise);
                }
            }
        }

        await Promise.allSettled(promises);

        // Cleanup: Delete dedup records older than 24 hours (runs in background, non-blocking)
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        db.collection('sentNotifications')
            .where('sentAt', '<', oneDayAgo)
            .limit(50)
            .get()
            .then(old => {
                const batch = db.batch();
                old.docs.forEach(d => batch.delete(d.ref));
                return batch.commit();
            })
            .catch(() => {}); // Non-critical, ignore errors

        return res.status(200).json({ 
            success: true, 
            processed: notificationsSent, 
            skipped: skippedDuplicates,
            reads: snapshot.size 
        });

    } catch (error) {
        console.error("CRON ERROR:", error);
        return res.status(500).json({ error: error.message });
    }
}