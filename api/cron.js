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

            // 5. Loop through the events array inside the document
            events.forEach((event) => {
                
                // 1. Check if the time matches
                const isTimeMatch = event.start === searchTime;
                
                // 2. Strict Day Check (Defaults to FALSE)
                let isDayMatch = false;
                if (event.days && Array.isArray(event.days)) {
                    isDayMatch = event.days.includes(currentDay);
                }

                // 3. Debugging Log: If the time matches, tell us what day it thinks it is!
                if (isTimeMatch) {
                    console.log(`[TIME MATCH] Task: "${event.title}". Today is: ${currentDay}. Task days: [${event.days}]. Will it fire? ${isDayMatch}`);
                }

                // 4. If BOTH time and day match, FIRE THE NOTIFICATION!
                if (isTimeMatch && isDayMatch) {
                    console.log(`Firing notification for: ${event.title} (Device: ${deviceId})`);

                    // NEW: The safety check for the venue!
                    const venueText = event.venue ? ` at ${event.venue}` : "";

                    const tokenPromise = db.collection('deviceTokens').doc(deviceId).get()
                        .then(async (tokenDoc) => {
                            if (!tokenDoc.exists || !tokenDoc.data().token) return;
                            
                            try {
                                await messaging.send({
                                    token: tokenDoc.data().token,
                                    notification: {
                                        title: "LifeSync: Upcoming Task", 
                                        body: `${event.title} starts in 10 minutes at ${event.start}${venueText}.`
                                    }
                                });
                                notificationsSent++;
                            } catch (sendError) {
                                console.error(`GOOGLE REJECTED TOKEN FOR ${deviceId}:`, sendError.message);
                                if (sendError.message.includes('not found') || sendError.code === 'messaging/registration-token-not-registered') {
                                    await db.collection('deviceTokens').doc(deviceId).delete();
                                }
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