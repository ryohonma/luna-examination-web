import { captureException } from "@luna/lib/error";
import { db } from "@luna/lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  startAfter,
  Timestamp,
} from "firebase/firestore";
import { Message } from "./model/message";

const messagesCollection = collection(db, "messages");

// 新規メッセージを作成 (POST)
export const post = async (
  message: Omit<Message, "id" | "createdAt" | "updatedAt">,
): Promise<Message> => {
  try {
    const newMessage = {
      ...message,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    const docRef = await addDoc(messagesCollection, newMessage);
    return {
      id: docRef.id,
      ...newMessage,
    };
  } catch (error) {
    captureException("Failed to create message", error);
    throw new Error("Failed to create message: " + error);
  }
};

// メッセージを更新 (PUT)
export const put = async (
  messageId: string,
  message: Omit<Message, "id" | "createdAt" | "updatedAt">,
): Promise<void> => {
  try {
    const messageDocRef = doc(messagesCollection, messageId);
    const updatedMessage = {
      ...message,
      updatedAt: Timestamp.now(),
    };
    await setDoc(messageDocRef, updatedMessage, { merge: true }); // 部分更新
  } catch (error) {
    captureException("Failed to update message", error);
    throw new Error("Failed to update message: " + error);
  }
};

// メッセージを削除 (DELETE)
export const remove = async (messageId: string): Promise<void> => {
  try {
    const messageDocRef = doc(messagesCollection, messageId);
    await deleteDoc(messageDocRef);
  } catch (error) {
    captureException("Failed to delete message", error);
    throw new Error("Failed to delete message: " + error);
  }
};

// メッセージをlimitとlastDocumentIDを指定して取得 (LIST)
export const list = async (
  limitCount: number,
  lastDocumentId?: string | null,
): Promise<Message[]> => {
  try {
    let q = query(
      messagesCollection,
      orderBy("createdAt", "desc"),
      limit(limitCount),
    );

    if (lastDocumentId) {
      // lastDocumentIDからドキュメント参照を作成
      const lastDocRef = doc(messagesCollection, lastDocumentId);
      const lastDocSnap = await getDoc(lastDocRef);

      // 指定されたドキュメントIDから開始するようにクエリを変更
      if (lastDocSnap.exists()) {
        q = query(q, startAfter(lastDocSnap));
      }
    }

    const snaps = await getDocs(q);
    return snaps.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Message[];
  } catch (error) {
    captureException("Failed to list messages", error);
    throw new Error("Failed to list messages: " + error);
  }
};

// メッセージをリアルタイム更新で取得 (LIST with Snapshots)
export const listBySnapshot = (
  callback: (messages: Message[], removedIds: string[]) => void,
  limitCount: number,
  offset: number = 0,
) => {
  try {
    const q = query(
      messagesCollection,
      orderBy("createdAt", "desc"),
      limit(limitCount),
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const messages: Message[] = [];
      const changes = snap.docChanges();
      const removedIds = changes
        .filter((change) => change.type === "removed")
        .map((change) => change.doc.id);

      if (offset > 0) {
        const lastVisible = snap.docs[offset - 1];
        if (lastVisible) {
          const paginatedQuery = query(
            messagesCollection,
            orderBy("createdAt", "desc"),
            startAfter(lastVisible),
            limit(limitCount),
          );

          onSnapshot(paginatedQuery, (paginatedSnapshot) => {
            paginatedSnapshot.forEach((doc) => {
              messages.push({
                id: doc.id,
                ...doc.data(),
              } as Message);
            });
            callback(messages, removedIds);
          });
        }
      } else {
        snap.forEach((doc) => {
          messages.push({
            id: doc.id,
            ...doc.data(),
          } as Message);
        });
        callback(messages, removedIds);
      }
    });

    return unsubscribe;
  } catch (error) {
    captureException("Failed to list messages with realtime updates", error);
    throw new Error("Failed to list messages with realtime updates");
  }
};
