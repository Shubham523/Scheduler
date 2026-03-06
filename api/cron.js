import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();
const messaging = getMessaging();

export default async function handler(req, res) {
  if (req.query.key !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
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
    const searchTimeStr = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

    // Format for the optimized query (integer minutes from midnight)
    const targetMinutesTotal = hours * 60 + minutes;

    const daysOfWeek = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const currentDay = daysOfWeek[targetTime.getUTCDay()];

    // Dedup key: date + time (e.g. "2026-03-06_22:43")
    const dateStr = `${targetTime.getUTCFullYear()}-${(targetTime.getUTCMonth() + 1).toString().padStart(2, "0")}-${targetTime.getUTCDate().toString().padStart(2, "0")}`;
    const dedupKey = `${dateStr}_${searchTimeStr}`;

    // --- OPTIMIZATION START ---
    const snapshot = await db
      .collection("userSchedules")
      .where("activeMinutes", "array-contains", targetMinutesTotal)
      .get();
    // --- OPTIMIZATION END ---

    if (snapshot.empty) {
      return res
        .status(200)
        .json({
          success: true,
          message: "No relevant schedules found for this minute.",
        });
    }

    let notificationsSent = 0;
    let skippedDuplicates = 0;
    const promises = [];

    for (const userDoc of snapshot.docs) {
      const deviceId = userDoc.id;
      const userData = userDoc.data();
      const events = userData.events || [];

      // Dedup: check the lastNotified map stored on this same document
      const lastNotified = userData.lastNotified || {};

      for (const event of events) {
        const isTimeMatch = event.start === searchTimeStr;
        const isDayMatch = event.days && event.days.includes(currentDay);

        if (isTimeMatch && isDayMatch) {
          // Build a per-event dedup key: "2026-03-06_22:43_EventTitle"
          const eventDedupKey = `${dedupKey}_${event.id || event.title}`;

          if (lastNotified[eventDedupKey]) {
            skippedDuplicates++;
            continue; // Already sent for this event today at this time
          }

          const venueText = event.venue ? ` at ${event.venue}` : "";

          const tokenPromise = db
            .collection("deviceTokens")
            .doc(deviceId)
            .get()
            .then(async (tokenDoc) => {
              if (!tokenDoc.exists || !tokenDoc.data().token) return;

              try {
                await messaging.send({
                  token: tokenDoc.data().token,
                  notification: {
                    title: "LifeSync: Upcoming Task",
                    body: `${event.title} starts in 10 minutes (${event.start})${venueText}.`,
                  },
                  webpush: {
                    notification: {
                      icon: "https://scheduler-ten-tan.vercel.app/vite.svg",
                      requireInteraction: true,
                    },
                    fcmOptions: {
                      link: "https://scheduler-ten-tan.vercel.app",
                    },
                  },
                });
                notificationsSent++;

                // Mark as sent on the SAME userSchedules doc (no extra collection)
                await db
                  .collection("userSchedules")
                  .doc(deviceId)
                  .update({
                    [`lastNotified.${eventDedupKey}`]: true,
                  });
              } catch (sendError) {
                if (
                  sendError.code ===
                  "messaging/registration-token-not-registered"
                ) {
                  await db.collection("deviceTokens").doc(deviceId).delete();
                }
              }
            });
          promises.push(tokenPromise);
        }
      }
    }

    await Promise.allSettled(promises);

    // Cleanup old dedup keys once a day (at midnight IST hour 0)
    if (hours === 0 && minutes === 0) {
      for (const userDoc of snapshot.docs) {
        const userData = userDoc.data();
        if (
          userData.lastNotified &&
          Object.keys(userData.lastNotified).length > 0
        ) {
          await db.collection("userSchedules").doc(userDoc.id).update({
            lastNotified: {},
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      processed: notificationsSent,
      skipped: skippedDuplicates,
      reads: snapshot.size,
    });
  } catch (error) {
    console.error("CRON ERROR:", error);
    return res.status(500).json({ error: error.message });
  }
}
