/* eslint-disable camelcase */
/* eslint-disable max-len */

const functions = require("firebase-functions");
const logger = require("firebase-functions/logger");

const admin = require("firebase-admin");

const {getFirestore} = require("firebase-admin/firestore");

admin.initializeApp();

const db = getFirestore();
// const db = admin.firestore();

function checkEventType(change) {
  const before = change.before.exists;
  const after = change.after.exists;

  if (!before && after) {
    logger.info("Event Type: 'create'");
    return "create";
  }
  if (before && after) {
    logger.info("Event Type: 'update'");
    return "update";
  }

  if (before && !after) {
    logger.info("Event Type: 'delete'");
    return "delete";
  }

  throw new Error(`Unknown firestore event! before: ${before}, after: ${after}`);
}


function fetchValueByDotOperator(object, field) {
  return field.split(".").reduce((acc, curr) => acc[curr], object);
}

function isValueChange(change, valueAttribute) {
  const before = change.before.data();
  const after = change.after.data();

  const beforeValue = fetchValueByDotOperator(before, valueAttribute);
  const afterValue = fetchValueByDotOperator(after, valueAttribute);

  if (beforeValue === afterValue) {
    logger.info(`Value change for attribute ${valueAttribute} is '${false}'`);
    return false;
  }

  logger.info(`Value change for attribute ${valueAttribute} is '${true}'`);
  return true;
}

function getUniqueValues(arr) {
  return arr.filter((value, index, self) => {
    return self.indexOf(value) === index;
  });
}

exports.updateDashboard = functions.firestore
    .document("doctors_procedures/{doctors_procedures_id}")
    .onWrite(async (change, context) => {
      logger.info(change, "@change");
      logger.info(context, "@context");

      const eventType = checkEventType(change);
      logger.info(eventType, "@eventType");

      const newDoctorProcedure = change.after.exists ? change.after.data() : null;
      const oldDoctorProcedure = change.before.exists ? change.before.data() : null;

      const doctorProcedure = newDoctorProcedure || oldDoctorProcedure;

      const doctorId = doctorProcedure.doctor_id;
      const dashboardRef = db.collection("dashboard");

      const dashboardSnapshot = await dashboardRef
          .where("doctor_id", "==", doctorId)
          .get();

      logger.info(dashboardSnapshot, "dashboardSSSnapshot");

      if (dashboardSnapshot.empty) {
        logger.info(`No matching documents with doctor_id ${doctorId}`);

        logger.info("Creating new document...");

        return await dashboardRef.add({
          doctor_id: doctorId,
          total_earnings: doctorProcedure.procedure.total_cost,
          total_hospitals: 1,
          total_procedures: 1,
        });
      }


      dashboardSnapshot.forEach(async (doc) => {
        logger.info(doc.id, "=>", doc.data());
        // const docPayload = doc.data();

        if (eventType === "create") {
          const procedureRef = db.collection("doctors_procedures");
          const procedureSnapshot = await procedureRef.where("doctor_id", "==", doctorId).get();

          let total_earnings = 0;

          const hospitals = [];
          const procedures = [];

          procedureSnapshot.forEach((p) => {
            logger.info(p.id, "=>", p.data());
            logger.info(p.id, "=>", p);

            const proc = p.data();

            total_earnings += proc.procedure.total_cost;
            hospitals.push(proc.hospital_reference);
            procedures.push(proc.procedure.procedure_reference);
          });

          hospitals.push(doctorProcedure.hospital_reference);
          procedures.push(doc.get("total_procedures"));
          return doc.ref.update({
            total_earnings: total_earnings +
              doctorProcedure.procedure.total_cost,
            total_hospitals: getUniqueValues(hospitals).length,
            total_unique_procedures: getUniqueValues(procedures).length,
            total_procedures: doc.get("total_procedures") + 1,
          });
        }

        if (eventType === "update") {
          const isCostChange = isValueChange(change, "procedure.total_cost");
          if (isCostChange) {
            let initialEarning = doc.get("total_earnings");
            if (!initialEarning) {
              initialEarning = oldDoctorProcedure.procedure.total_cost;
            } else {
              initialEarning = initialEarning - oldDoctorProcedure.procedure.total_cost;
            }
            return doc.ref.update({
              total_earnings: initialEarning +
                doctorProcedure.procedure.total_cost,
            });
          }
        }

        if (eventType === "delete") {
          return doc.ref.update({
            total_earnings: doc.get("total_earnings") -
            oldDoctorProcedure.procedure.total_cost,
          });
        }
      });
      // return snap.ref.update({

      // });
    });
