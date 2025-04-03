const { logger } = require('firebase-functions');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const admin = require('firebase-admin'); // Add this import

initializeApp(); // Initialize Firebase Admin SDK
const userDB = getFirestore();

const sendNotification = async (deviceToken, message) => {
  const payload = {
    notification: {
      title: "Service Update",
      body: message || "A service slot has been updated.",
    },
    data: {
      customKey: "customValue",
    },
    token: deviceToken,
  };

  try {
    const response = await admin.messaging().send(payload);
    logger.log("Notification sent successfully:", response);
  } catch (error) {
    logger.error("Error sending notification:", error);
  }
};

const getUserID = async () => {
  const orderDoc = await userDB.collection('orders').where('status','==','Pending').orderBy('timestamp', 'asc').limit(1).get();
  const latestUser = orderDoc.docs[0];
  logger.log("fetched doc");
  // Log the latest order document
  logger.log("Latest order document:", latestUser.id, latestUser.data());

  // Get the userID of the person who placed the order
  const notifyUser = latestUser.data().userId;

  // FC token retrieved
  const userDocQuerySnap = await userDB.collection('User').doc(notifyUser).get();
  const userDocSnap = userDocQuerySnap.data();
  const fcmToken = userDocSnap.fcmToken;

  return {
    fcmToken,
    latestUserID: latestUser.id, // Document ID of the latest order
  };
};


exports.updateUser = onDocumentUpdated(
  { document: "services/{service}/slots/{slot}" },
  async (event) => {
    const newValue = event.data.after.data();
    let deviceToken = null;  // Declare deviceToken here to avoid undefined errors

    const user_info = await getUserID();
    deviceToken = user_info.fcmToken;
    const order_id = user_info.latestUserID;
    logger.log("Device tokenL ", deviceToken);
    if (newValue.isAvail === true) {
      if (user_info) {
        // Log the deviceToken and order_id
        logger.log("Device Token:", deviceToken);
        logger.log("Order ID:", order_id);

        const updateData = {
          isAvail: false,  // Mark the slot as booked
          orderID: order_id,  // Add the order ID to the document
        };

        const updateRef = event.data.after.ref;
        try {
          await updateRef.update(updateData);
          logger.log("Slot booked and document updated successfully.");
        } catch (error) {
          logger.error("Error updating document:", error);
        }
        try{
          await userDB.collection('orders').doc(order_id).update({status : "Processing"});
          logger.log("Updated successfully");
        } catch(error){
          logger.warn("could not update");
        }
      } else {
        logger.warn("No user info found, skipping slot update.");
      }
    }

    // Ensure deviceToken exists before attempting to send a notification
    if (deviceToken) {
      await sendNotification(deviceToken, "Hello, your service slot has been updated.");
    } else {
      logger.warn("No device token found, notification not sent.");
    }
  }
);
