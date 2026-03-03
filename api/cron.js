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
        const localOffset = 5.5 * 60 * 60 * 1000;
        const localNow = new Date(now.getTime() + localOffset);
        const targetTime = new Date(localNow.getTime() + 10 * 60000);

        const hours = targetTime.getUTCHours().toString().padStart(2, '0');
        const minutes = targetTime.getUTCMinutes().toString().padStart(2, '0');
        const searchTime = `${hours}:${minutes}`;

        const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const currentDay = daysOfWeek[targetTime.getUTCDay()];

        const snapshot = await db.collection('userSchedules').get();

        if (snapshot.empty) {
            return res.status(200).json({ success: true, message: "No schedules found." });
        }

        let notificationsSent = 0;
        const promises = [];

        snapshot.docs.forEach((doc) => {
            const deviceId = doc.id;
            const userData = doc.data();
            const events = userData.events || [];

            events.forEach((event) => {
                const isTimeMatch = event.start === searchTime;
                let isDayMatch = true;
                if (event.isRecurring && event.days && event.days.length > 0) {
                    isDayMatch = event.days.includes(currentDay);
                }

                if (isTimeMatch && isDayMatch) {
                    console.log(`Match! Task: ${event.title} for device: ${deviceId}`);

                    const tokenPromise = db.collection('deviceTokens').doc(deviceId).get()
                        .then(async (tokenDoc) => {
                            if (!tokenDoc.exists) {
                                console.log(`No token document found for ${deviceId}`);
                                return;
                            }
                            
                            const data = tokenDoc.data();
                            
                            // Let's actually see what we are grabbing!
                            if (!data.token) {
                                console.error(`CRASH AVOIDED: Document exists but 'token' field is missing. It has fields:`, Object.keys(data));
                                return;
                            }

                            try {
                                await messaging.send({
                                    token: data.token,
                                    notification: {
                                        title: "LifeSync: Upcoming Task", 
                                        body: `${event.title} starts in 10 minutes at ${event.start}.`
                                    }
                                });
                                console.log(`SUCCESS: Notification sent to ${deviceId}`);
                                notificationsSent++;
                            } catch (sendError) {
                                // THIS is where the Google rejection happens. We print it safely.
                                console.error(`GOOGLE REJECTED TOKEN FOR ${deviceId}:`, sendError.message);
                            }
                        });
                    promises.push(tokenPromise);
                }
            });
        });

        // Use allSettled so one failure doesn't crash the whole batch
        await Promise.allSettled(promises);
        return res.status(200).json({ success: true, processed: notificationsSent });

    } catch (error) {
        // Explicitly print the fatal error to Vercel logs
        console.error("FATAL SERVER ERROR:", error);
        return res.status(500).json({ error: error.message });
    }
}