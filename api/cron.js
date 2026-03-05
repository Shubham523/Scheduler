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

        // --- OPTIMIZATION START ---
        // Instead of fetching all users, we only fetch users who have a task at this specific minute
        const snapshot = await db.collection('userSchedules')
            .where("activeMinutes", "array-contains", targetMinutesTotal)
            .get();
        // --- OPTIMIZATION END ---

        if (snapshot.empty) {
            return res.status(200).json({ success: true, message: "No relevant schedules found for this minute." });
        }

        let notificationsSent = 0;
        const promises = [];
        const debugInfo = {
            searchTimeStr,
            targetMinutesTotal,
            currentDay,
            istNow: istNow.toISOString(),
            targetTime: targetTime.toISOString(),
            users: []
        };

        snapshot.docs.forEach((userDoc) => {
            const deviceId = userDoc.id;
            const userData = userDoc.data();
            const events = userData.events || [];
            
            const userDebug = {
                deviceId,
                eventCount: events.length,
                events: events.map(e => ({ start: e.start, days: e.days, title: e.title })),
                matches: []
            };

            events.forEach((event) => {
                const isTimeMatch = event.start === searchTimeStr;
                const isDayMatch = event.days && event.days.includes(currentDay);

                userDebug.matches.push({
                    title: event.title,
                    start: event.start,
                    days: event.days,
                    isTimeMatch,
                    isDayMatch
                });

                if (isTimeMatch && isDayMatch) {
                    const venueText = event.venue ? ` at ${event.venue}` : "";
                    
                    const tokenPromise = db.collection('deviceTokens').doc(deviceId).get()
                        .then(async (tokenDoc) => {
                            if (!tokenDoc.exists || !tokenDoc.data().token) {
                                userDebug.tokenStatus = 'missing';
                                return;
                            }
                            userDebug.tokenStatus = 'found';
                            
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
                                userDebug.sendResult = 'success';
                            } catch (sendError) {
                                userDebug.sendResult = sendError.message;
                                if (sendError.code === 'messaging/registration-token-not-registered') {
                                    await db.collection('deviceTokens').doc(deviceId).delete();
                                }
                            }
                        });
                    promises.push(tokenPromise);
                }
            });
            debugInfo.users.push(userDebug);
        });

        await Promise.allSettled(promises);
        return res.status(200).json({ success: true, processed: notificationsSent, reads: snapshot.size, debug: debugInfo });

    } catch (error) {
        console.error("CRON ERROR:", error);
        return res.status(500).json({ error: error.message });
    }
}