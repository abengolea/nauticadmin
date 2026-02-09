import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  type UploadTaskSnapshot,
} from "firebase/storage";
import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import type { FirebaseStorage } from "firebase/storage";

export interface UploadPlayerVideoParams {
  storage: FirebaseStorage;
  firestore: Firestore;
  userId: string;
  schoolId: string;
  playerId: string;
  file: File;
  title?: string;
  description?: string;
  /** Habilidades/categorías: dribling, pegada, definicion, estirada, etc. */
  skills?: string[];
}

export interface UploadPlayerVideoResult {
  videoId: string;
  url: string;
}

/** Sube un video a Storage y guarda metadata en Firestore. Retorna el id del documento y la URL. */
export async function uploadPlayerVideo(
  params: UploadPlayerVideoParams
): Promise<UploadPlayerVideoResult> {
  const {
    storage,
    firestore,
    userId,
    schoolId,
    playerId,
    file,
    title,
    description,
    skills,
  } = params;

  const colRef = collection(
    firestore,
    `schools/${schoolId}/playerVideos`
  );
  const videoRef = doc(colRef);
  const videoId = videoRef.id;

  const ext = file.name.split(".").pop()?.toLowerCase() || "webm";
  const storagePath = `schools/${schoolId}/players/${playerId}/videos/${videoId}.${ext}`;
  const storageRef = ref(storage, storagePath);

  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      "state_changed",
      (_snap: UploadTaskSnapshot) => {},
      reject,
      () => resolve()
    );
  });

  const url = await getDownloadURL(storageRef);

  await setDoc(videoRef, {
    playerId,
    storagePath,
    url,
    ...(title != null && title !== "" && { title }),
    ...(description != null && description !== "" && { description }),
    ...(skills != null && skills.length > 0 && { skills }),
    createdAt: serverTimestamp(),
    createdBy: userId,
  });

  return { videoId, url };
}

/** Progreso de subida (0–100) para usar en UI. */
export function uploadPlayerVideoWithProgress(
  params: UploadPlayerVideoParams,
  onProgress: (percent: number) => void
): Promise<UploadPlayerVideoResult> {
  const {
    storage,
    firestore,
    userId,
    schoolId,
    playerId,
    file,
    title,
    description,
    skills,
  } = params;

  const colRef = collection(
    firestore,
    `schools/${schoolId}/playerVideos`
  );
  const videoRef = doc(colRef);
  const videoId = videoRef.id;

  const ext = file.name.split(".").pop()?.toLowerCase() || "webm";
  const storagePath = `schools/${schoolId}/players/${playerId}/videos/${videoId}.${ext}`;
  const storageRef = ref(storage, storagePath);

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      "state_changed",
      (snap) => {
        const percent = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        onProgress(percent);
      },
      reject,
      async () => {
        const url = await getDownloadURL(storageRef);
        await setDoc(videoRef, {
          playerId,
          storagePath,
          url,
          ...(title != null && title !== "" && { title }),
          ...(description != null && description !== "" && { description }),
          ...(skills != null && skills.length > 0 && { skills }),
          createdAt: serverTimestamp(),
          createdBy: userId,
        });
        resolve({ videoId, url });
      }
    );
  });
}
