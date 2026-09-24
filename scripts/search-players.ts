import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
import * as admin from "firebase-admin";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config();

function initDb(): admin.firestore.Firestore {
  if (admin.apps.length) return admin.firestore();
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ??
    (fs.existsSync("service-account.json") ? "service-account.json" : "");
  if (!credPath) throw new Error("Falta credencial Firebase");
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(fs.readFileSync(credPath, "utf8"))),
  });
  return admin.firestore();
}

async function main() {
  const db = initDb();
  const snap = await db.collection("schools/WZAf1Mw08Uq047wneIxI/players").get();
  const pattern = process.argv[2] ?? "PORTUAR";
  let c = 0;
  for (const d of snap.docs) {
    const x = d.data() as { lastName?: string; firstName?: string; dni?: string; cuit?: string; archived?: boolean };
    if (x.archived) continue;
    const n = `${x.lastName ?? ""} ${x.firstName ?? ""}`.trim();
    if (n.toUpperCase().includes(pattern.toUpperCase())) {
      console.log(n, "| dni:", x.dni ?? "-", "| cuit:", x.cuit ?? "-");
      c++;
    }
  }
  console.log(`Matches: ${c} / ${snap.size} players`);
}

main();
