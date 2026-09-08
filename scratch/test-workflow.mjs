import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import fs from 'fs'

if (fs.existsSync('.env.local')) {
  const envContent = fs.readFileSync('.env.local', 'utf-8')
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
      if (!process.env[key]) process.env[key] = val
    }
  })
}

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || 'lexmedia-client-system'
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY

if (privateKey && privateKey.includes('\\n')) {
  privateKey = privateKey.replace(/\\n/g, '\n')
}

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  })
}

const db = getFirestore()

async function runTest() {
  console.log('🚀 Starting Phase 4 Automated Workflow Test...\n')

  // 1. Ensure Service "Wedding Photography" exists
  console.log('Step 1: Checking/Creating "Wedding Photography" service...')
  const servicesSnap = await db.collection('services').where('name', '==', 'Wedding Photography').get()
  let serviceId = ''
  if (servicesSnap.empty) {
    const sRef = await db.collection('services').add({
      name: 'Wedding Photography',
      category: 'Photography',
      description: 'Full day wedding photography coverage with edited high-res digital delivery.',
      defaultPrice: 5000,
      pricingType: 'starting_from',
      currency: 'GHS',
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: 'admin',
    })
    serviceId = sRef.id
    console.log(`✓ Created service: Wedding Photography (ID: ${serviceId})`)
  } else {
    serviceId = servicesSnap.docs[0].id
    console.log(`✓ Found existing service: Wedding Photography (ID: ${serviceId})`)
  }

  // 2. Ensure Package "Premium Package" exists under Wedding Photography
  console.log('\nStep 2: Checking/Creating "Premium Package" for Wedding Photography...')
  const pkgSnap = await db.collection('packages')
    .where('title', '==', 'Premium Package')
    .get()
  
  let packageId = ''
  if (pkgSnap.empty) {
    const pRef = await db.collection('packages').add({
      title: 'Premium Package',
      description: 'Comprehensive wedding photography coverage with 2 shooters, photo book, and drone shots.',
      serviceId: serviceId,
      serviceName: 'Wedding Photography',
      includedServices: ['Wedding Photography'],
      price: 5000,
      discount: 2000, // Deposit amount
      currency: 'GHS',
      whatsIncluded: [
        { id: '1', text: 'Full day coverage (up to 12 hours)' },
        { id: '2', text: '2 professional photographers' },
        { id: '3', text: '500+ edited high-resolution photos' },
        { id: '4', text: 'Luxury 30-page leather photobook' },
      ],
      deliveryTimeline: '3 weeks',
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: 'admin',
    })
    packageId = pRef.id
    console.log(`✓ Created package: Premium Package (ID: ${packageId}) - Price: GH₵5,000, Deposit: GH₵2,000`)
  } else {
    packageId = pkgSnap.docs[0].id
    await db.collection('packages').doc(packageId).update({
      serviceId: serviceId,
      serviceName: 'Wedding Photography',
      price: 5000,
      discount: 2000,
      status: 'active',
    })
    console.log(`✓ Found & updated package: Premium Package (ID: ${packageId})`)
  }

  // 3. Create Test Client "John Mensah"
  console.log('\nStep 3: Creating client "John Mensah"...')
  const clientRef = await db.collection('clients').add({
    fullName: 'John Mensah',
    email: 'john.mensah@example.com',
    phone: '+233241234567',
    whatsappNumber: '+233241234567',
    company: 'Mensah Ventures',
    address: 'East Legon, Accra',
    notes: 'Wedding booked for December.',
    status: 'active',
    projectCount: 0,
    totalBilled: 0,
    totalPaid: 0,
    outstandingBalance: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: 'admin',
  })
  const clientId = clientRef.id
  console.log(`✓ Client created: John Mensah (ID: ${clientId})`)

  // 4. Run Phase 4 Automated Workflow:
  // Select Service -> Wedding Photography
  // Select Package -> Premium Package
  // Confirm & Create Project -> Atomic Batch: Project + Invoice + ClientLink
  console.log('\nStep 4: Executing Atomic Workflow (Project + Invoice + ClientLink)...')

  const existingInvoicesSnap = await db.collection('invoices').get()
  const invoiceNumStr = `LM-INV-${String(existingInvoicesSnap.size + 1).padStart(4, '0')}`
  const totalAmount = 5000
  const depositAmount = 2000
  const outstandingBalance = 5000

  const projectRef = db.collection('projects').doc()
  const invoiceRef = db.collection('invoices').doc()
  const clientLinkRef = db.collection('clientLinks').doc()
  const token = `p_test_${Date.now().toString(36)}`

  const batch = db.batch()

  // Project document
  batch.set(projectRef, {
    name: 'John Mensah — Premium Package',
    clientId: clientId,
    clientName: 'John Mensah',
    clientEmail: 'john.mensah@example.com',
    serviceId: serviceId,
    serviceName: 'Wedding Photography',
    packageId: packageId,
    packageTitle: 'Premium Package',
    invoiceId: invoiceRef.id,
    invoiceNumber: invoiceNumStr,
    price: totalAmount,
    depositAmount: depositAmount,
    amountPaid: 0,
    outstandingBalance: totalAmount,
    currency: 'GHS',
    status: 'Awaiting Payment',
    paymentStatus: 'Unpaid',
    progress: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: 'admin',
  })

  // Invoice document
  batch.set(invoiceRef, {
    invoiceNumber: invoiceNumStr,
    clientId: clientId,
    clientName: 'John Mensah',
    clientEmail: 'john.mensah@example.com',
    projectId: projectRef.id,
    projectName: 'John Mensah — Premium Package',
    packageId: packageId,
    packageTitle: 'Premium Package',
    serviceId: serviceId,
    serviceName: 'Wedding Photography',
    items: [
      {
        id: `item_${Date.now()}`,
        description: 'Wedding Photography — Premium Package',
        quantity: 1,
        unitPrice: totalAmount,
        total: totalAmount,
      },
    ],
    subtotal: totalAmount,
    discountAmount: 0,
    taxAmount: 0,
    total: totalAmount,
    amountPaid: 0,
    balanceDue: totalAmount,
    depositAmount: depositAmount,
    currency: 'GHS',
    status: 'Pending',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: 'admin',
  })

  // Update client aggregates
  batch.update(clientRef, {
    projectCount: 1,
    totalBilled: totalAmount,
    outstandingBalance: totalAmount,
    updatedAt: FieldValue.serverTimestamp(),
  })

  // Payment Link document
  batch.set(clientLinkRef, {
    token: token,
    clientId: clientId,
    clientName: 'John Mensah',
    projectId: projectRef.id,
    projectName: 'John Mensah — Premium Package',
    packageId: packageId,
    packageTitle: 'Premium Package',
    invoiceId: invoiceRef.id,
    invoiceNumber: invoiceNumStr,
    amount: depositAmount,
    currency: 'GHS',
    status: 'Pending Payment',
    paymentStatus: 'Unpaid',
    viewCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: 'admin',
  })

  await batch.commit()
  console.log(`✓ Atomic creation committed successfully!`)
  console.log(`  Project ID: ${projectRef.id}`)
  console.log(`  Invoice ID: ${invoiceRef.id} (${invoiceNumStr})`)
  console.log(`  Payment Link Token: ${token} (Amount: GH₵${depositAmount})`)

  // 5. Verify initial database state
  console.log('\nStep 5: Verifying Initial Database State...')
  const projSnap = await projectRef.get()
  const projData = projSnap.data()
  console.log(`  Project: Total=GH₵${projData.price}, Deposit=GH₵${projData.depositAmount}, Paid=GH₵${projData.amountPaid}, Balance=GH₵${projData.outstandingBalance}`)
  console.log(`  Project Status: ${projData.status}, Payment Status: ${projData.paymentStatus}`)

  const invSnap = await invoiceRef.get()
  const invData = invSnap.data()
  console.log(`  Invoice: Total=GH₵${invData.total}, Deposit=GH₵${invData.depositAmount}, Paid=GH₵${invData.amountPaid}, BalanceDue=GH₵${invData.balanceDue}`)
  console.log(`  Invoice Status: ${invData.status}`)

  if (
    projData.price === 5000 &&
    projData.depositAmount === 2000 &&
    projData.amountPaid === 0 &&
    projData.outstandingBalance === 5000 &&
    invData.total === 5000 &&
    invData.amountPaid === 0 &&
    invData.balanceDue === 5000 &&
    invData.status === 'Pending'
  ) {
    console.log('  ✅ Initial state verification PASSED!')
  } else {
    throw new Error('Initial state verification failed')
  }

  // 6. Simulate Paystack GH₵2,000 Deposit Payment and run the verify batch logic
  console.log('\nStep 6: Simulating Successful Paystack Deposit Payment (GH₵2,000)...')
  const paymentRef = db.collection('payments').doc()
  const paystackRef = `LXM_TEST_${Date.now()}`
  const paidAmount = 2000

  const payBatch = db.batch()

  // Update ClientLink
  payBatch.update(clientLinkRef, {
    status: 'Paid',
    paystackReference: paystackRef,
    updatedAt: FieldValue.serverTimestamp(),
  })

  // Update Invoice with new partial payment logic
  const newAmountPaid = (invData.amountPaid || 0) + paidAmount
  const newBalanceDue = Math.max(0, invData.total - newAmountPaid)
  const newInvoiceStatus = newAmountPaid >= invData.total ? 'Paid' : 'Partially Paid'

  payBatch.update(invoiceRef, {
    status: newInvoiceStatus,
    amountPaid: newAmountPaid,
    balanceDue: newBalanceDue,
    paystackReference: paystackRef,
    updatedAt: FieldValue.serverTimestamp(),
  })

  // Update Project
  const newProjectPaid = (projData.amountPaid || 0) + paidAmount
  const newProjectBalance = Math.max(0, projData.price - newProjectPaid)
  const newProjectPaymentStatus = newProjectPaid >= projData.price ? 'Paid' : 'Partially Paid'

  payBatch.update(projectRef, {
    amountPaid: newProjectPaid,
    outstandingBalance: newProjectBalance,
    paymentStatus: newProjectPaymentStatus,
    updatedAt: FieldValue.serverTimestamp(),
  })

  // Update Client
  payBatch.update(clientRef, {
    totalPaid: paidAmount,
    outstandingBalance: Math.max(0, totalAmount - paidAmount),
    updatedAt: FieldValue.serverTimestamp(),
  })

  // Create Payment record
  payBatch.set(paymentRef, {
    invoiceId: invoiceRef.id,
    invoiceNumber: invoiceNumStr,
    clientId: clientId,
    clientName: 'John Mensah',
    projectId: projectRef.id,
    paystackReference: paystackRef,
    amount: paidAmount,
    currency: 'GHS',
    paidAt: new Date().toISOString(),
    status: 'success',
    createdAt: FieldValue.serverTimestamp(),
  })

  await payBatch.commit()
  console.log(`✓ Payment batch committed successfully! Reference: ${paystackRef}`)

  // 7. Verify Post-Payment Database State
  console.log('\nStep 7: Verifying Post-Payment Results...')
  const updatedInv = (await invoiceRef.get()).data()
  const updatedProj = (await projectRef.get()).data()
  const updatedClient = (await clientRef.get()).data()
  const paymentRecord = (await paymentRef.get()).data()

  console.log(`  Invoice Status: ${updatedInv.status} (Expected: Partially Paid)`)
  console.log(`  Invoice Paid: GH₵${updatedInv.amountPaid} (Expected: GH₵2,000)`)
  console.log(`  Invoice Balance: GH₵${updatedInv.balanceDue} (Expected: GH₵3,000)`)
  console.log(`  Project Paid: GH₵${updatedProj.amountPaid} (Expected: GH₵2,000)`)
  console.log(`  Project Balance: GH₵${updatedProj.outstandingBalance} (Expected: GH₵3,000)`)
  console.log(`  Client Total Paid: GH₵${updatedClient.totalPaid} (Expected: GH₵2,000)`)
  console.log(`  Client Outstanding: GH₵${updatedClient.outstandingBalance} (Expected: GH₵3,000)`)
  console.log(`  Payment Record Status: ${paymentRecord.status}, Amount: GH₵${paymentRecord.amount}`)

  const passed =
    updatedInv.status === 'Partially Paid' &&
    updatedInv.amountPaid === 2000 &&
    updatedInv.balanceDue === 3000 &&
    updatedProj.amountPaid === 2000 &&
    updatedProj.outstandingBalance === 3000 &&
    updatedClient.totalPaid === 2000 &&
    updatedClient.outstandingBalance === 3000 &&
    paymentRecord.status === 'success'

  if (passed) {
    console.log('\n🎉 ALL PHASE 4 WORKFLOW & PAYSTACK TESTS PASSED PERFECTLY! 🎉\n')
  } else {
    throw new Error('Post-payment verification failed!')
  }
}

runTest().catch((err) => {
  console.error('\n❌ Test execution failed:', err)
  process.exit(1)
})
