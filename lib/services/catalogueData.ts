import {
  COLLECTIONS,
  getDocuments,
  addDocument,
  updateDocument,
} from '@/lib/firebase/firestore'
import type { Service, Package, AddOn, PackagePricingType, PackageDepositType } from '@/lib/types'

export interface OfficialPackageDef {
  category: string
  title: string
  price: number
  pricingType: PackagePricingType
  inclusions: string[]
  depositType?: PackageDepositType
  depositValue?: number
  description?: string
  sortOrder?: number
}

export interface OfficialAddOnDef {
  name: string
  price: number
  pricingType: 'fixed' | 'starting_from'
  category?: string
  description?: string
  sortOrder?: number
}

export const OFFICIAL_CATEGORIES: string[] = [
  'Photography',
  'Videography',
  'Brand Identity',
  'Graphic Design',
  'Website Design & Development',
  'E-commerce',
  'Application Development',
  'Monthly Services',
]

export const OFFICIAL_PACKAGES: OfficialPackageDef[] = [
  // ─── 1. PHOTOGRAPHY ──────────────────────────────────────────
  {
    category: 'Photography',
    title: 'Portrait Session',
    price: 500,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: '1-hour individual portrait shoot with professional retouching.',
    inclusions: [
      'Up to 1 hour',
      '1 location',
      '1 outfit',
      '5 professionally edited photos',
      'Basic retouching',
      'Digital delivery',
    ],
    sortOrder: 1,
  },
  {
    category: 'Photography',
    title: 'Personal Branding',
    price: 900,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Tailored photo session for founders, executives, and creative professionals.',
    inclusions: [
      'Up to 2 hours',
      'Up to 2 outfits',
      '10 edited photos',
      '5 professionally retouched photos',
      'Multiple setups',
      'Digital delivery',
    ],
    sortOrder: 2,
  },
  {
    category: 'Photography',
    title: 'Premium Branding Session',
    price: 1500,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Comprehensive personal and brand visual identity shoot.',
    inclusions: [
      'Up to 3 hours',
      'Up to 3 outfits',
      'Multiple setups',
      '20 edited photos',
      '10 premium retouched photos',
      'Social-media-ready files',
    ],
    sortOrder: 3,
  },
  {
    category: 'Photography',
    title: 'Event — Essential',
    price: 1500,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Essential documentary photo coverage for corporate and private events.',
    inclusions: [
      'Up to 3 hours',
      'Event coverage',
      'Edited photographs',
    ],
    sortOrder: 4,
  },
  {
    category: 'Photography',
    title: 'Event — Standard',
    price: 3000,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Half-day professional documentary coverage for mid-size events.',
    inclusions: [
      'Up to 6 hours',
      'Full event coverage',
      'Professionally edited photographs',
    ],
    sortOrder: 5,
  },
  {
    category: 'Photography',
    title: 'Event — Full Day',
    price: 4500,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Full day comprehensive coverage with an expansive edited gallery.',
    inclusions: [
      'Up to 8 hours',
      'Full event coverage',
      'Large edited gallery',
    ],
    sortOrder: 6,
  },
  {
    category: 'Photography',
    title: 'Premium Event',
    price: 6000,
    pricingType: 'starting_from',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Multi-photographer production with expedited turnaround.',
    inclusions: [
      'Extended coverage',
      'Additional photographer where required',
      'Priority delivery',
      'Custom requirements',
    ],
    sortOrder: 7,
  },

  // ─── 2. VIDEOGRAPHY ──────────────────────────────────────────
  {
    category: 'Videography',
    title: 'Social Video',
    price: 800,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'High-impact short-form reel or TikTok tailored for brand engagement.',
    inclusions: [
      'Short-form promotional video',
      'Basic filming',
      'Professional editing',
      'Social-media format',
    ],
    sortOrder: 8,
  },
  {
    category: 'Videography',
    title: 'Basic Video Production',
    price: 1500,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Clean single-camera video production with highlight reel.',
    inclusions: [
      'Up to 3 hours',
      '1 videographer',
      '1 camera',
      'Basic audio',
      'Edited highlight video',
      'Social-media version',
    ],
    sortOrder: 9,
  },
  {
    category: 'Videography',
    title: 'Standard Video Production',
    price: 3000,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Multi-angle production with professional sound recording and colour grading.',
    inclusions: [
      'Up to 5 hours',
      '1–2 cameras',
      'Professional audio',
      'Highlight video',
      'Full event video',
      'Basic colour grading',
      'Social-media cut',
    ],
    sortOrder: 10,
  },
  {
    category: 'Videography',
    title: 'Premium Video Production',
    price: 5500,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Full-day cinematic crew production with cinematic grading and teaser edits.',
    inclusions: [
      'Up to 8 hours',
      'Multi-camera production',
      'Professional audio',
      'Cinematic highlight',
      'Full event film',
      'Advanced colour grading',
      'Social-media teaser',
    ],
    sortOrder: 11,
  },
  {
    category: 'Videography',
    title: 'Corporate Interview',
    price: 2500,
    pricingType: 'starting_from',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Broadcast-standard corporate executive interview setup.',
    inclusions: [
      'Professional interview production',
      'Filming',
      'Editing',
    ],
    sortOrder: 12,
  },
  {
    category: 'Videography',
    title: 'Company Profile Video',
    price: 5000,
    pricingType: 'starting_from',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Corporate brand narrative highlighting capabilities and team culture.',
    inclusions: [
      'Corporate storytelling',
      'Production',
      'Editing',
    ],
    sortOrder: 13,
  },
  {
    category: 'Videography',
    title: 'Product / Commercial Video',
    price: 6000,
    pricingType: 'starting_from',
    depositType: 'percentage',
    depositValue: 50,
    description: 'High-end advertising and product showcase video production.',
    inclusions: [
      'Product or campaign production',
      'Custom production scope',
    ],
    sortOrder: 14,
  },
  {
    category: 'Videography',
    title: 'Music Video',
    price: 8000,
    pricingType: 'starting_from',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Creative music video production from concept to master grade.',
    inclusions: [
      'Production based on concept',
      'Custom crew and locations',
    ],
    sortOrder: 15,
  },

  // ─── 3. BRAND IDENTITY ───────────────────────────────────────
  {
    category: 'Brand Identity',
    title: 'Brand Starter',
    price: 2000,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Core logo suite and fundamental brand assets for new businesses.',
    inclusions: [
      'Primary logo',
      'Secondary logo',
      'Logo mark',
      'Colour palette',
      'Typography',
      'Basic logo usage guide',
      'PNG, JPG, SVG and PDF exports',
      '2 revision rounds',
    ],
    sortOrder: 16,
  },
  {
    category: 'Brand Identity',
    title: 'Brand Growth',
    price: 4000,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Complete visual identity system with stationery and social templates.',
    inclusions: [
      'Complete logo system',
      'Colour system',
      'Typography system',
      'Brand guidelines',
      'Business card',
      'Letterhead',
      'Social profile graphics',
      '5 social templates',
      'Brand mockups',
      'Source files',
      '3 revision rounds',
    ],
    sortOrder: 17,
  },
  {
    category: 'Brand Identity',
    title: 'Brand Pro',
    price: 7500,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Deep brand strategy, comprehensive guidelines, stationery, and marketing deck.',
    inclusions: [
      'Brand strategy',
      'Complete logo system',
      'Brand colours',
      'Typography',
      'Brand personality',
      'Voice/tone direction',
      'Comprehensive brand guidelines',
      'Social-media kit',
      'Stationery',
      'Marketing templates',
      'Presentation/company-profile template',
      'Packaging/signage direction',
    ],
    sortOrder: 18,
  },
  {
    category: 'Brand Identity',
    title: 'Corporate Brand System',
    price: 12000,
    pricingType: 'starting_from',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Enterprise-grade visual and strategic identity architecture.',
    inclusions: [
      'Brand strategy',
      'Complete visual identity',
      'Corporate identity',
      'Brand guidelines',
      'Marketing materials',
      'Packaging',
      'Signage',
      'Social-media system',
      'Presentation templates',
      'Brand rollout support',
    ],
    sortOrder: 19,
  },

  // ─── 4. GRAPHIC DESIGN ───────────────────────────────────────
  {
    category: 'Graphic Design',
    title: 'Flyer Design',
    price: 200,
    pricingType: 'fixed',
    depositType: 'none',
    depositValue: 0,
    description: 'Custom print and digital marketing promotional flyer.',
    inclusions: [
      '1 custom flyer',
      'Social-media version',
      'Print-ready version',
      '2 revisions',
    ],
    sortOrder: 20,
  },
  {
    category: 'Graphic Design',
    title: 'Premium Flyer',
    price: 350,
    pricingType: 'fixed',
    depositType: 'none',
    depositValue: 0,
    description: 'Advanced visual manipulation and artistic graphic design.',
    inclusions: [
      'Custom design',
      'Advanced photo manipulation',
      'Social and print versions',
      '3 revisions',
      'Source file',
    ],
    sortOrder: 21,
  },
  {
    category: 'Graphic Design',
    title: 'Flyer Pack',
    price: 1200,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Suite of 5 coordinated flyers for multi-date or multi-product promotions.',
    inclusions: [
      '5 custom flyers',
      'Consistent visual style',
      'Social and print versions',
    ],
    sortOrder: 22,
  },
  {
    category: 'Graphic Design',
    title: 'Social Content Pack',
    price: 2000,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Curated bundle of social posts, promotional banners, and story designs.',
    inclusions: [
      '10 social-media designs',
      '5 promotional flyers',
      '5 story designs',
      'Consistent brand styling',
    ],
    sortOrder: 23,
  },

  // ─── 5. WEBSITE DESIGN & DEVELOPMENT ─────────────────────────
  {
    category: 'Website Design & Development',
    title: 'Starter Website',
    price: 3500,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Clean responsive 3-page website with contact lead forms and WhatsApp integration.',
    inclusions: [
      'Up to 3 pages',
      'Responsive design',
      'Custom layout',
      'Contact form',
      'WhatsApp button',
      'Social-media links',
      'Basic SEO',
      'Domain connection',
      'Deployment',
      '1 revision round',
    ],
    sortOrder: 24,
  },
  {
    category: 'Website Design & Development',
    title: 'Business Website',
    price: 6500,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Full-featured company website with CMS, blog, analytics, and 30-day support.',
    inclusions: [
      'Up to 7 pages',
      'Custom UI/UX',
      'CMS',
      'Contact forms',
      'WhatsApp integration',
      'Blog/news section',
      'Basic SEO',
      'Google Analytics',
      '2 revision rounds',
      '30-day support',
    ],
    sortOrder: 25,
  },
  {
    category: 'Website Design & Development',
    title: 'Professional Website',
    price: 10000,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Scalable corporate web platform with dynamic booking/request forms and 90-day support.',
    inclusions: [
      'Up to 12 pages',
      'Custom UI/UX',
      'CMS',
      'Advanced forms',
      'SEO setup',
      'Analytics',
      'Blog',
      'Booking/request system',
      'Third-party integrations',
      'Performance optimization',
      '90-day support',
    ],
    sortOrder: 26,
  },

  // ─── 6. E-COMMERCE ───────────────────────────────────────────
  {
    category: 'E-commerce',
    title: 'E-commerce Starter',
    price: 12000,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Turnkey online store with Paystack payment processing and order management.',
    inclusions: [
      'Product catalogue',
      'Shopping cart',
      'Checkout',
      'Customer accounts',
      'Paystack integration',
      'Order management',
      'Admin dashboard',
      'Email notifications',
      'Responsive design',
    ],
    sortOrder: 27,
  },
  {
    category: 'E-commerce',
    title: 'E-commerce Business',
    price: 20000,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Advanced retail platform with inventory tracking, coupon discounts, and order analytics.',
    inclusions: [
      'Advanced product management',
      'Customer dashboard',
      'Order tracking',
      'Inventory management',
      'Promotions/discounts',
      'Delivery configuration',
      'Analytics',
      'Advanced admin dashboard',
    ],
    sortOrder: 28,
  },
  {
    category: 'E-commerce',
    title: 'Custom E-commerce',
    price: 30000,
    pricingType: 'starting_from',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Multi-store, multi-vendor, or bespoke commerce infrastructure.',
    inclusions: [
      'Multi-vendor marketplace options',
      'Multiple stores',
      'Advanced logistics',
      'Custom payment systems',
      'Complex inventory',
      'Third-party integrations',
      'Custom customer portals',
    ],
    sortOrder: 29,
  },

  // ─── 7. APPLICATION DEVELOPMENT ──────────────────────────────
  {
    category: 'Application Development',
    title: 'App Starter',
    price: 12000,
    pricingType: 'starting_from',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Cross-platform mobile or web application MVP with authentication and database.',
    inclusions: [
      'Cross-platform application',
      'Custom UI',
      'User authentication',
      'Database',
      'Basic admin functionality',
      'Up to approximately 8 major screens',
      'Deployment assistance',
    ],
    sortOrder: 30,
  },
  {
    category: 'Application Development',
    title: 'Business Application',
    price: 20000,
    pricingType: 'starting_from',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Production business software with payments, notifications, and analytics dashboard.',
    inclusions: [
      'Custom UI/UX',
      'Authentication',
      'Database',
      'Admin dashboard',
      'Payment integration',
      'API integrations',
      'Notifications',
      'User accounts',
      'Reporting',
      'Deployment',
    ],
    sortOrder: 31,
  },
  {
    category: 'Application Development',
    title: 'Professional Platform',
    price: 35000,
    pricingType: 'starting_from',
    depositType: 'percentage',
    depositValue: 50,
    description: 'End-to-end platform featuring web admin, mobile clients, and robust cloud APIs.',
    inclusions: [
      'Web admin',
      'Application',
      'Backend',
      'Database',
      'Authentication',
      'Payments',
      'Notifications',
      'API integrations',
      'Analytics',
      'Deployment',
    ],
    sortOrder: 32,
  },
  {
    category: 'Application Development',
    title: 'Enterprise / Custom Platform',
    price: 50000,
    pricingType: 'starting_from',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Large-scale distributed software system with custom microservices and enterprise security.',
    inclusions: [
      'Multiple applications',
      'Advanced backend systems',
      'Complex APIs',
      'Enterprise dashboards',
      'Advanced permissions',
      'Large-scale databases',
      'Multiple integrations',
      'Custom infrastructure',
    ],
    sortOrder: 33,
  },

  // ─── 8. MONTHLY SERVICES ─────────────────────────────────────
  {
    category: 'Monthly Services',
    title: 'Social Starter',
    price: 1500,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Monthly social creative retainer covering 8 posts and 4 story designs.',
    inclusions: [
      '8 static designs',
      '4 story designs',
      'Basic content formatting',
      'Monthly content delivery',
    ],
    sortOrder: 34,
  },
  {
    category: 'Monthly Services',
    title: 'Social Growth',
    price: 3000,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Active social media management with reels, content calendar, and static graphics.',
    inclusions: [
      '12 static designs',
      '8 story designs',
      '4 short-form videos',
      'Content calendar',
      'Monthly content planning',
    ],
    sortOrder: 35,
  },
  {
    category: 'Monthly Services',
    title: 'Social Pro',
    price: 5000,
    pricingType: 'fixed',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Comprehensive creative direction, multi-video output, and complete social planning.',
    inclusions: [
      '16 static designs',
      '8 story designs',
      '8 short-form videos',
      'Content calendar',
      'Creative direction',
      'Monthly content planning',
    ],
    sortOrder: 36,
  },
  {
    category: 'Monthly Services',
    title: 'Website Maintenance',
    price: 500,
    pricingType: 'starting_from',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Monthly ongoing maintenance, security updates, and content revisions.',
    inclusions: [
      'Website updates',
      'Content changes',
      'Basic maintenance',
    ],
    sortOrder: 37,
  },
  {
    category: 'Monthly Services',
    title: 'Application Maintenance',
    price: 1000,
    pricingType: 'starting_from',
    depositType: 'percentage',
    depositValue: 50,
    description: 'Continuous bug fixes, dependencies upgrades, and server monitoring.',
    inclusions: [
      'Application maintenance',
      'Updates',
      'Basic support',
    ],
    sortOrder: 38,
  },
]

export const OFFICIAL_ADD_ONS: OfficialAddOnDef[] = [
  {
    name: 'Additional website page',
    price: 250,
    pricingType: 'fixed',
    category: 'Website Design & Development',
    description: 'Design and implementation of an additional responsive webpage.',
    sortOrder: 1,
  },
  {
    name: 'Copywriting',
    price: 500,
    pricingType: 'starting_from',
    category: 'General',
    description: 'Professional sales and brand copywriting per section or page.',
    sortOrder: 2,
  },
  {
    name: 'SEO setup',
    price: 500,
    pricingType: 'starting_from',
    category: 'Website Design & Development',
    description: 'Search engine optimization audit, meta tags, and structured schema markup.',
    sortOrder: 3,
  },
  {
    name: 'Blog setup',
    price: 500,
    pricingType: 'fixed',
    category: 'Website Design & Development',
    description: 'Full CMS publication architecture for articles and company updates.',
    sortOrder: 4,
  },
  {
    name: 'Booking system',
    price: 1000,
    pricingType: 'starting_from',
    category: 'Website Design & Development',
    description: 'Automated appointment calendar with email/SMS confirmations.',
    sortOrder: 5,
  },
  {
    name: 'Paystack integration',
    price: 500,
    pricingType: 'starting_from',
    category: 'Website Design & Development',
    description: 'Mobile Money and card payment processing integration.',
    sortOrder: 6,
  },
  {
    name: 'WhatsApp integration',
    price: 300,
    pricingType: 'starting_from',
    category: 'Website Design & Development',
    description: 'Direct click-to-chat WhatsApp widget and prefilled message routing.',
    sortOrder: 7,
  },
  {
    name: 'Custom API integration',
    price: 1000,
    pricingType: 'starting_from',
    category: 'Application Development',
    description: 'Third-party API connection, webhook processing, and data synchronisation.',
    sortOrder: 8,
  },
  {
    name: 'Admin dashboard',
    price: 2000,
    pricingType: 'starting_from',
    category: 'Application Development',
    description: 'Internal administrative management back-office console.',
    sortOrder: 9,
  },
  {
    name: 'Customer portal',
    price: 2000,
    pricingType: 'starting_from',
    category: 'Application Development',
    description: 'Authenticated client dashboard for order tracking and assets review.',
    sortOrder: 10,
  },
  {
    name: 'Additional application feature',
    price: 1000,
    pricingType: 'starting_from',
    category: 'Application Development',
    description: 'Custom software functional module or screen.',
    sortOrder: 11,
  },
  {
    name: 'Data migration',
    price: 500,
    pricingType: 'starting_from',
    category: 'General',
    description: 'Database, product, or client records extraction and import.',
    sortOrder: 12,
  },
  {
    name: 'Extra hour (Photography)',
    price: 300,
    pricingType: 'fixed',
    category: 'Photography',
    description: 'Additional hour of shoot time on location.',
    sortOrder: 13,
  },
  {
    name: 'Extra edited photo (Photography)',
    price: 30,
    pricingType: 'fixed',
    category: 'Photography',
    description: 'Additional color-graded and corrected photograph.',
    sortOrder: 14,
  },
  {
    name: 'Premium retouch (Photography)',
    price: 75,
    pricingType: 'fixed',
    category: 'Photography',
    description: 'High-end beauty skin frequency separation and detailed composite retouch.',
    sortOrder: 15,
  },
  {
    name: 'Additional photographer',
    price: 800,
    pricingType: 'starting_from',
    category: 'Photography',
    description: 'Second shooter for multi-angle event coverage.',
    sortOrder: 16,
  },
  {
    name: 'Same-day delivery (Photography)',
    price: 500,
    pricingType: 'starting_from',
    category: 'Photography',
    description: 'Priority image editing and release on the date of production.',
    sortOrder: 17,
  },
]

/**
 * Idempotently seeds or synchronises the official LEXMEDIA.GH catalogue.
 * Preserves custom packages, does not duplicate existing entries.
 */
export async function seedOfficialCatalogue(): Promise<{
  servicesCreated: number
  packagesCreated: number
  packagesUpdated: number
  addOnsCreated: number
  totalPackages: number
  totalAddOns: number
}> {
  const [existingServices, existingPackages, existingAddOns] = await Promise.all([
    getDocuments<Service>(COLLECTIONS.SERVICES),
    getDocuments<Package>(COLLECTIONS.PACKAGES),
    getDocuments<AddOn>(COLLECTIONS.ADD_ONS),
  ])

  let servicesCreated = 0
  let packagesCreated = 0
  let packagesUpdated = 0
  let addOnsCreated = 0

  const now = new Date().toISOString()

  // 1. Ensure all 8 canonical categories exist in SERVICES
  const serviceMap = new Map<string, Service>()
  existingServices.forEach((s) => {
    const key = (s.name || s.category || '').trim().toLowerCase()
    serviceMap.set(key, s)
  })

  for (const catName of OFFICIAL_CATEGORIES) {
    const key = catName.trim().toLowerCase()
    if (!serviceMap.has(key)) {
      const newServiceData = {
        name: catName,
        category: catName,
        description: `Official LEXMEDIA.GH ${catName} service suite.`,
        defaultPrice: 0,
        pricingType: 'starting_from' as const,
        currency: 'GHS',
        status: 'active' as const,
        createdAt: now,
        updatedAt: now,
        createdBy: 'system_catalogue',
      }
      const newId = await addDocument(COLLECTIONS.SERVICES, newServiceData)
      serviceMap.set(key, { id: newId, ...newServiceData } as any)
      servicesCreated++
    }
  }

  // 2. Ensure all 38 packages exist
  const packageMap = new Map<string, Package>()
  existingPackages.forEach((p) => {
    const titleKey = (p.title || p.name || '').trim().toLowerCase()
    const catKey = (p.category || p.serviceName || '').trim().toLowerCase()
    packageMap.set(`${catKey}:::${titleKey}`, p)
    packageMap.set(`any:::${titleKey}`, p)
  })

  for (const pkgDef of OFFICIAL_PACKAGES) {
    const catKey = pkgDef.category.trim().toLowerCase()
    const titleKey = pkgDef.title.trim().toLowerCase()
    const exactMatch = packageMap.get(`${catKey}:::${titleKey}`) || packageMap.get(`any:::${titleKey}`)

    const parentService = serviceMap.get(catKey)
    const inclusionsItems = pkgDef.inclusions.map((text, idx) => ({
      id: `inc-${idx + 1}`,
      text,
    }))

    if (!exactMatch) {
      // Create new package
      const newPackageData = {
        title: pkgDef.title,
        name: pkgDef.title,
        category: pkgDef.category,
        serviceId: parentService?.id || '',
        serviceName: pkgDef.category,
        description: pkgDef.description || '',
        price: pkgDef.price,
        pricingType: pkgDef.pricingType,
        depositType: pkgDef.depositType || 'percentage',
        depositValue: pkgDef.depositValue ?? 50,
        depositAmount: pkgDef.depositType === 'fixed' ? (pkgDef.depositValue ?? 0) : Math.round((pkgDef.price * (pkgDef.depositValue ?? 50)) / 100),
        currency: 'GHS',
        inclusions: pkgDef.inclusions,
        whatsIncluded: inclusionsItems,
        status: 'active' as const,
        active: true,
        sortOrder: pkgDef.sortOrder || 99,
        createdAt: now,
        updatedAt: now,
        createdBy: 'system_catalogue',
      }
      await addDocument(COLLECTIONS.PACKAGES, newPackageData)
      packagesCreated++
    } else {
      // Update missing fields if needed without overwriting user custom pricing if altered
      const updates: Partial<Package> = {}
      if (!exactMatch.pricingType) updates.pricingType = pkgDef.pricingType
      if (!exactMatch.inclusions || exactMatch.inclusions.length === 0) updates.inclusions = pkgDef.inclusions
      if (!exactMatch.category) updates.category = pkgDef.category
      if (!exactMatch.serviceName) updates.serviceName = pkgDef.category
      if (exactMatch.active === undefined) updates.active = exactMatch.status !== 'inactive'

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = now
        await updateDocument(COLLECTIONS.PACKAGES, exactMatch.id, updates)
        packagesUpdated++
      }
    }
  }

  // 3. Ensure all 17 Add-ons exist
  const addOnMap = new Map<string, AddOn>()
  existingAddOns.forEach((a) => {
    const key = (a.name || '').trim().toLowerCase()
    addOnMap.set(key, a)
  })

  for (const addOnDef of OFFICIAL_ADD_ONS) {
    const key = addOnDef.name.trim().toLowerCase()
    if (!addOnMap.has(key)) {
      const newAddOnData = {
        name: addOnDef.name,
        price: addOnDef.price,
        pricingType: addOnDef.pricingType,
        category: addOnDef.category || 'General',
        description: addOnDef.description || '',
        active: true,
        sortOrder: addOnDef.sortOrder || 99,
        createdAt: now,
        updatedAt: now,
        createdBy: 'system_catalogue',
      }
      await addDocument(COLLECTIONS.ADD_ONS, newAddOnData)
      addOnsCreated++
    }
  }

  const finalPackages = await getDocuments<Package>(COLLECTIONS.PACKAGES)
  const finalAddOns = await getDocuments<AddOn>(COLLECTIONS.ADD_ONS)

  return {
    servicesCreated,
    packagesCreated,
    packagesUpdated,
    addOnsCreated,
    totalPackages: finalPackages.length,
    totalAddOns: finalAddOns.length,
  }
}
