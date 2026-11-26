// Educational content only; keep commerce and contact destinations out of these pages.
export const informationPages = [
  {
    slug: 'cannabis-delivery-guelph',
    title: 'Cannabis: Ontario Age, ID and Delivery Rules | Speedy Sweeties',
    heading: 'Cannabis: age, ID and delivery rules.',
    description: 'A plain-language overview of Ontario cannabis age, identification and retailer delivery requirements, with links to official provincial guidance.',
    introduction: 'Information for people in Guelph and across Ontario about the rules that apply to recreational cannabis.',
    sections: [
      { id: 'minimum-age', title: 'Minimum age', text: 'Ontario’s minimum age for buying, using, possessing or growing recreational cannabis is 19.', source: 0 },
      { id: 'identification', title: 'Identification checks', text: 'Before cannabis is sold or distributed to someone who appears younger than 25, the person providing it must check prescribed identification and be satisfied that the recipient is at least 19.', source: 1 },
      { id: 'delivery-rules', title: 'Retailer delivery requirements', text: 'For cannabis sold under a retail store authorization, Ontario Regulation 468/18 requires delivery by the authorization holder or their employee. The cannabis must remain in its original, unopened packaging. A general courier arrangement does not, by itself, satisfy that requirement.', source: 2 },
      { id: 'age-acknowledgement', title: 'An age checkbox is not identification', text: 'An online declaration that someone is 19 or older does not replace the identification checks required by law.', source: 1 }
    ],
    sources: [
      { label: 'Ontario cannabis laws — minimum age', url: 'https://www.ontario.ca/page/cannabis-laws' },
      { label: 'Cannabis Control Act, 2017 — section 7', url: 'https://www.ontario.ca/laws/statute/17c26' },
      { label: 'Ontario Regulation 468/18 — section 20.2', url: 'https://www.ontario.ca/laws/regulation/180468' }
    ]
  },
  {
    slug: 'vape-delivery-guelph',
    title: 'Vaping and Tobacco: Ontario Age and ID Rules | Speedy Sweeties',
    heading: 'Vaping and tobacco: age and ID rules.',
    description: 'A plain-language overview of Ontario age and identification requirements for tobacco and vapour products, with links to official provincial guidance.',
    introduction: 'Information for people in Guelph and across Ontario about age restrictions for tobacco and vapour products.',
    sections: [
      { id: 'minimum-age', title: 'Minimum age', text: 'Ontario prohibits selling or supplying tobacco or vapour products to anyone younger than 19.', source: 0 },
      { id: 'identification', title: 'Identification checks', text: 'If someone appears younger than 25, the person selling or supplying the product must ask for identification and be satisfied that the recipient is at least 19.', source: 0 },
      { id: 'products-covered', title: 'What the rules cover', text: 'Ontario’s definition of vapour products includes electronic cigarettes, their parts and substances made or sold for use in them. Age restrictions are not limited to products described as containing nicotine.', source: 0 },
      { id: 'age-acknowledgement', title: 'An age checkbox is not identification', text: 'Selecting “19 or older” on a website does not replace a required identification check. Ontario also has separate rules for retailers and product promotion; the provincial guidance explains them.', source: 0 }
    ],
    sources: [
      { label: 'Ontario rules for selling tobacco and vapour products', url: 'https://www.ontario.ca/page/rules-selling-tobacco-and-vapour-products' }
    ]
  }
];
