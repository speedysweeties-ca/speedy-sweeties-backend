// Public landing-page copy. No stock, retailer affiliation or licensing is implied.
export const services = [
  {
    slug: 'beer-delivery-guelph', key: 'beer', label: 'Beer delivery', short: 'Beer',
    title: 'Beer Delivery in Guelph | Speedy Sweeties',
    description: 'Local beer delivery in Guelph with Speedy Sweeties. See how to request delivery, check current rates and order on our main website. Adults 19+ with valid ID.',
    eyebrow: 'BEER DELIVERY · GUELPH, ONTARIO',
    heading: 'Beer delivery.\nGuelph, we’ve got you.',
    intro: 'Skip the extra trip. Send your beer request to your local delivery team, then get back to your evening.',
    image: true, cta: 'Order online', destination: 'order',
    detailTitle: 'Your beer run, handled locally.',
    detail: 'Tell us the beer, package size and quantity you want in the main website’s order form. Specific details help dispatch confirm your request. Products depend on store stock and opening hours; submitting a request does not reserve inventory.',
    highlights: ['Name your beer and pack size', 'Add ice, snacks or mixers', 'Have your valid ID ready'],
    steps: ['Open the main order form and enter your delivery details.', 'Describe your beer request, quantity and any extras.', 'Dispatch confirms availability and delivery details. Show valid ID at the door.'],
    note: 'Alcohol delivery is for adults aged 19 and over. Valid government-issued photo ID is required. Delivery remains subject to eligibility and responsible-service requirements.',
    questions: [
      ['Can I add snacks or ice?', 'Include the extras in the same request. Additional store stops may carry a charge; check the rates on our main website.'],
      ['How long does delivery take?', 'Most deliveries take 15–45 minutes. This is an estimate, not a guarantee; store availability, traffic and demand can affect timing.'],
      ['Where do I check the delivery price?', 'The main website lists current delivery rates and payment information. Call dispatch to confirm availability and pricing outside Guelph.']
    ]
  },
  {
    slug: 'alcohol-delivery-guelph', key: 'alcohol', label: 'Alcohol delivery', short: 'Alcohol',
    title: 'Alcohol Delivery in Guelph | Speedy Sweeties',
    description: 'Request local alcohol delivery in Guelph with Speedy Sweeties. Wine, spirits, coolers and beer requests through our main website. Adults 19+ with valid ID.',
    eyebrow: 'ALCOHOL DELIVERY · GUELPH, ONTARIO',
    heading: 'Alcohol delivery,\nwithout the extra trip.',
    intro: 'Wine, spirits, coolers or beer: start your delivery request with a local Guelph team. Stay home and leave the trip to us.',
    image: true, cta: 'Order online', destination: 'order',
    detailTitle: 'One place to start your delivery request.',
    detail: 'Use the main Speedy Sweeties website for your wine, spirits, cooler and beer requests. Include the product name, bottle or package size and quantity. Dispatch confirms availability and delivery details; no live store inventory is promised on this page.',
    highlights: ['Wine, spirits, coolers and beer', 'Mixers and convenience extras', 'Local dispatch you can call'],
    steps: ['Visit our main website and check the current rates and hours.', 'Enter your address, requested items and payment preference.', 'Have valid ID available when your eligible delivery arrives.'],
    note: 'You must be 19 or older with valid government-issued photo ID. Delivery is subject to availability, eligibility and responsible-service requirements. Don’t drink and drive.',
    questions: [
      ['Do you have an online product catalogue?', 'This page is a delivery-service introduction. Describe your items in the main order form; availability is confirmed by dispatch.'],
      ['Can I request more than one type of item?', 'Yes. List the items and quantities clearly. Extra store stops may add a charge; the main website has current rate information.'],
      ['Can I order while the business is closed?', 'The main order form checks current business hours. Visit the main website for the current open or closed status.']
    ]
  },
  {
    slug: 'vape-delivery-guelph', key: 'vapes', label: 'Vape delivery information', short: 'Vapes',
    title: 'Vape Delivery Information in Guelph | Speedy Sweeties',
    description: 'Age and service information for adults in Guelph. Learn about identification requirements for age-restricted items and explore Speedy Sweeties’ local services.',
    eyebrow: 'SERVICE INFORMATION · ADULTS 19+',
    heading: 'Vape delivery\ninformation.',
    intro: 'A straightforward guide to age restrictions and delivery requirements for adults in Guelph.',
    cta: 'Visit our main website', destination: 'home',
    detailTitle: 'Age-restricted items need extra care.',
    detail: 'Tobacco and vapour products are age-restricted in Ontario. A delivery request does not replace a retailer’s sales requirements or the identification check at handoff. This page is informational; it does not list products, flavours, prices or store inventory.',
    highlights: ['Adults aged 19 and over', 'Valid photo identification', 'No unattended handoff'],
    steps: ['Review the age and identification requirements before making any request.', 'Remember that retailer restrictions and delivery eligibility still apply.', 'Explore the main website for information about Speedy Sweeties’ other local services.'],
    note: 'A self-declared 19+ welcome screen is an acknowledgement, not verified age or identity. The required checks still apply to age-restricted transactions.',
    reference: { url: 'https://www.ontario.ca/page/rules-selling-tobacco-and-vapour-products', label: 'Ontario tobacco and vapour product rules' },
    questions: [
      ['Does clicking “Yes, I’m 19+” verify my age?', 'No. The welcome screen is a self-declaration. It does not replace valid identification or any retailer or delivery checks.'],
      ['Does this page show available products?', 'No. There are no product listings, prices, retailer endorsements or inventory promises on this page.'],
      ['Where can I read about your other services?', 'Use the main website link or the service navigation below to explore Speedy Sweeties’ local delivery information.']
    ]
  },
  {
    slug: 'cannabis-delivery-guelph', key: 'cannabis', label: 'Cannabis delivery information', short: 'Cannabis',
    title: 'Cannabis Delivery Information in Guelph | Speedy Sweeties',
    description: 'Cannabis delivery information for adults in Guelph, including Ontario’s licensed-retailer delivery requirements. Explore Speedy Sweeties’ other local services.',
    eyebrow: 'ONTARIO DELIVERY INFORMATION · ADULTS 19+',
    heading: 'Cannabis delivery.\nKnow the requirements.',
    intro: 'Delivery arrangements matter. Here’s what adults in Guelph should know about Ontario’s licensed-retailer requirements.',
    cta: 'Explore our other services', destination: 'services',
    detailTitle: 'Retailer delivery has specific rules.',
    detail: 'Ontario’s retail cannabis rules require cannabis sold under a retail store authorization to be delivered by the authorization holder or their employee. An independent courier arrangement does not by itself meet that requirement. This page does not offer cannabis products or represent Speedy Sweeties as an authorized cannabis retailer.',
    highlights: ['Adults aged 19 and over', 'Retailer authorization matters', 'Identification checks still apply'],
    steps: ['Understand who is authorized to fulfil a cannabis delivery.', 'Check the applicable retailer, age and identification requirements.', 'Visit our main website to learn about Speedy Sweeties’ other delivery services.'],
    note: 'This is general service information, not a product catalogue or an offer of independent cannabis delivery. It does not claim any retailer partnership or licence.',
    reference: { url: 'https://www.ontario.ca/laws/regulation/180468', label: 'Ontario cannabis retail rules — section 20.2' },
    questions: [
      ['Does a 19+ screen establish delivery authorization?', 'No. A welcome screen does not verify age, identity or whether a business is authorized to fulfil a particular delivery.'],
      ['Are cannabis products sold on this page?', 'No. This page contains information only. It has no product listings, prices or cannabis ordering controls.'],
      ['What else does Speedy Sweeties deliver?', 'Explore beer and alcohol delivery information or convenience delivery for snacks, ice, soft drinks and everyday essentials.']
    ]
  },
  {
    slug: 'convenience-delivery-guelph', key: 'convenience', label: 'Convenience delivery', short: 'Convenience',
    title: 'Convenience & Snack Delivery in Guelph | Speedy Sweeties',
    description: 'Snacks, ice, soft drinks, mixers and everyday convenience items delivered locally in Guelph. Start your Speedy Sweeties request on our main website.',
    eyebrow: 'CONVENIENCE DELIVERY · GUELPH, ONTARIO',
    heading: 'The little essentials.\nDelivered locally.',
    intro: 'The ice you forgot. The snacks you’re missing. The soft drinks for tonight. Get the everyday extras without another trip.',
    cta: 'Order online', destination: 'order',
    detailTitle: 'Small errands. A little more breathing room.',
    detail: 'Request snacks, ice, soda, mixers and convenience-store essentials through our main website. Tell dispatch exactly what you need, including sizes and quantities. Availability depends on the stores that are open; call if you are unsure whether a pickup can be arranged.',
    highlights: ['Snacks and soft drinks', 'Ice and mixers', 'Everyday convenience items'],
    steps: ['Open the main order form and enter your Guelph delivery address.', 'List the items, sizes and quantities you need.', 'Dispatch confirms availability and delivery details.'],
    note: 'Most deliveries take 15–45 minutes, depending on traffic, demand and store availability. Age-restricted items have separate eligibility and ID requirements.',
    questions: [
      ['Can I request ice and snacks together?', 'Yes. List everything in one request. Extra store stops may carry an additional charge; current rates are on the main website.'],
      ['What if I need something outside the usual list?', 'Call dispatch about your pickup before ordering. Availability and delivery eligibility need to be confirmed.'],
      ['Do you deliver outside Guelph?', 'Call 519-826-8097 to confirm service availability and pricing outside the city before placing your request.']
    ]
  }
];
