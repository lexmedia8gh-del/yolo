import { getAdminDb } from '../lib/firebase/admin'
import { hashPin } from '../lib/utils/pin'

async function checkSecuritySettings() {
  try {
    const db = getAdminDb()
    const secRef = db.collection('settings').doc('security')
    
    const newHashed = hashPin('123456')
    await secRef.set({
        pinHash: newHashed.hash,
        pinSalt: newHashed.salt,
        enrolledAt: new Date().toISOString()
    })
    console.log('PIN set to 123456')
  } catch (err) {
    console.error('Error setting PIN:', err)
  }
}


checkSecuritySettings()
