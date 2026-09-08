import { NextResponse } from 'next/server'
import { db } from '@/lib/firebase/config'
import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore'

export async function GET() {
  const result: any = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'lexmedia-client-system',
    apiKeyConfigured: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_API_KEY !== 'demo-api-key',
    appIdConfigured: !!process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  }

  try {
    // 1. Attempt to add a real test document to Firestore
    const testDoc = {
      fullName: 'Verified Test Client',
      email: 'test@lexmedia.com',
      phone: '+233 24 000 0000',
      company: 'Lexmedia Diagnostics',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: 'diagnostic-test',
    }

    const docRef = await addDoc(collection(db, 'clients'), testDoc)
    result.writeSuccess = true
    result.createdDocId = docRef.id

    // 2. Attempt to read from Firestore
    const snap = await getDocs(collection(db, 'clients'))
    result.readSuccess = true
    result.totalClientsInFirestore = snap.size

    return NextResponse.json({
      status: 'success',
      message: 'Cloud Firestore is fully connected and accepting writes!',
      ...result,
    })
  } catch (err: any) {
    return NextResponse.json(
      {
        status: 'error',
        errorCode: err.code || 'unknown',
        errorMessage: err.message,
        ...result,
        diagnosis:
          err.code === 'permission-denied'
            ? 'Cloud Firestore is reachable, but your Firestore Security Rules in Firebase Console are currently blocking writes. Set rules to "allow read, write: if true;" in Firebase Console -> Firestore Database -> Rules.'
            : 'Check Firebase configuration in .env.local',
      },
      { status: 500 }
    )
  }
}
