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
        // 1. Get current time in IST (UTC + 5:30)
        const now = new Date();
        const localOffset = 5.5 * 60 * 60 * 1000;
        const localNow = new Date(now.getTime() + localOffset);

        // 2. Add 10 minutes to find the "Target Time"
        const targetTime = new Date(localNow.getTime() + 10 * 60000);

        // Format to "HH:mm" (e.g., "09:00")
        const hours = targetTime.getUTCHours().toString().padStart(2, '0');
        const minutes = targetTime.getUTCMinutes().toString().padStart(2, '0');
        const searchTime = `${hours}:${minutes}`;

        // Get the current Day of the Week (e.g., "Monday")
        const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const currentDay = daysOfWeek[targetTime.getUTCDay()];

        console.log(`Checking for tasks on ${currentDay} at exactly: ${searchTime}`);

        // 3. Fetch ALL user schedules 
        // (Since we can't query inside arrays directly via Firestore)
        const snapshot = await db.collection('userSchedules').get();

        if (snapshot.empty) {
            return res.status(200).json({ success: true, message: "No schedules found in DB." });
        }

        let notificationsSent = 0;
        const promises = [];

        // 4. Loop through each user's document
        snapshot.docs.forEach((doc) => {
            const deviceId = doc.id; // Your document ID is the device ID!
            const userData = doc.data();
            const events = userData.events || []; // Safely grab the events array

            // 5. Loop through the events array inside the document
            events.forEach((event) => {
                
                // Check if the time matches
                const isTimeMatch = event.start === searchTime;
                
                // Check if today is one of the scheduled days (if recurring)
                let isDayMatch = true;
                if (event.isRecurring && event.days && event.days.length > 0) {
                    isDayMatch = event.days.includes(currentDay);
                }

                // If both time and day match, FIRE THE NOTIFICATION!
                if (isTimeMatch && isDayMatch) {
                    console.log(`Match! Task: ${event.title} for device: ${deviceId}`);

                    const tokenPromise = db.collection('deviceTokens').doc(deviceId).get()
                        .then(tokenDoc => {
                            if (tokenDoc.exists) {
                                notificationsSent++;
                                return messaging.send({
                                    token: tokenDoc.data().token,
                                    notification: {
                                        title: "LifeSync: Upcoming Task", 
                                        body: `${event.title} starts in 10 minutes at ${event.start}.`
                                    }
                                });
                            }
                        });
                    promises.push(tokenPromise);
                }
            });
        });

        await Promise.all(promises);
        return res.status(200).json({ success: true, processed: notificationsSent });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}