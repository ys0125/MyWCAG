// YSuresh Codes — provinces.js

'use strict';

const PROVINCES = {
  'Ontario': [
    'Toronto', 'Ottawa', 'Mississauga', 'Brampton', 'Hamilton', 'London',
    'Markham', 'Vaughan', 'Kitchener', 'Windsor', 'Richmond Hill', 'Burlington',
    'Oakville', 'Oshawa', 'Barrie', 'St. Catharines', 'Cambridge', 'Kingston',
    'Guelph', 'Thunder Bay', 'Waterloo', 'Brantford', 'Ajax', 'Whitby',
    'Pickering', 'Newmarket', 'North Bay', 'Sudbury', 'Sault Ste. Marie',
    'Peterborough', 'Sarnia', 'Welland', 'Belleville', 'Niagara Falls',
    'Timmins', 'Cornwall', 'Stratford', 'Orangeville', 'Midland', 'Owen Sound',
    'Woodstock', 'Collingwood', 'Orillia', 'Milton', 'Aurora', 'Halton Hills',
    'Grimsby', 'Fort Erie', 'Tillsonburg', 'Cobourg', 'Leamington',
    'Quinte West', 'Bradford', 'Georgina', 'Pembroke', 'Elliot Lake',
    'Kapuskasing', 'Kenora', 'Dryden', 'Huntsville', 'Bracebridge',
    'Parry Sound', 'Hawkesbury', 'Smiths Falls', 'Carleton Place', 'Arnprior',
    'Trenton', 'Napanee', 'Lindsay', 'Brockville', 'Prescott', 'Renfrew',
  ],

  'British Columbia': [
    'Vancouver', 'Surrey', 'Burnaby', 'Richmond', 'Kelowna', 'Abbotsford',
    'Coquitlam', 'Langley', 'Saanich', 'Delta', 'Kamloops', 'Nanaimo',
    'Chilliwack', 'Maple Ridge', 'New Westminster', 'Prince George',
    'North Vancouver', 'West Vancouver', 'Penticton', 'Vernon', 'Victoria',
    'Courtenay', 'Campbell River', 'Port Coquitlam', 'Mission', 'Cranbrook',
    'Fort St. John', 'Prince Rupert', 'Terrace', 'Williams Lake', 'Quesnel',
    'Powell River', 'Salmon Arm', 'Squamish', 'White Rock', 'Port Moody',
    'Langford', 'Colwood', 'Oak Bay', 'Parksville', 'Duncan', 'Comox',
    'Trail', 'Nelson', 'Castlegar', 'Merritt', 'Hope', 'Dawson Creek',
    'Kitimat', 'Smithers', 'Fort Nelson', 'Revelstoke', 'Golden',
  ],

  'Alberta': [
    'Calgary', 'Edmonton', 'Red Deer', 'Lethbridge', 'St. Albert',
    'Medicine Hat', 'Grande Prairie', 'Airdrie', 'Spruce Grove', 'Okotoks',
    'Cochrane', 'Fort McMurray', 'Lloydminster', 'Camrose', 'Brooks',
    'Cold Lake', 'Lacombe', 'Wetaskiwin', 'Stony Plain', 'Sylvan Lake',
    'High River', 'Beaumont', 'Leduc', 'Chestermere', 'Canmore',
    'Drumheller', 'Innisfail', 'Ponoka', 'Olds', 'Didsbury', 'Strathmore',
    'Taber', 'Coaldale', 'Pincher Creek', 'Claresholm', 'Slave Lake',
    'Peace River', 'High Level', 'Barrhead', 'Edson', 'Hinton', 'Jasper',
    'Whitecourt', 'Athabasca', 'Bonnyville', 'Vermilion', 'Wainwright',
  ],

  'Quebec': [
    'Montreal', 'Quebec City', 'Laval', 'Gatineau', 'Longueuil',
    'Sherbrooke', 'Saguenay', 'Lévis', 'Trois-Rivières', 'Terrebonne',
    'Saint-Jean-sur-Richelieu', 'Repentigny', 'Brossard', 'Drummondville',
    'Saint-Jérôme', 'Granby', 'Blainville', 'Mirabel', 'Shawinigan',
    'Mascouche', 'Saint-Hyacinthe', 'Châteauguay', 'Rimouski',
    'Rouyn-Noranda', 'Victoriaville', 'Salaberry-de-Valleyfield',
    'Vaudreuil-Dorion', 'Sept-Îles', 'Alma', 'Joliette', 'Sorel-Tracy',
    'Baie-Comeau', 'Saint-Georges', 'Thetford Mines', 'Val-d\'Or',
    'Beloeil', 'Varennes', 'Chambly', 'Candiac', 'La Prairie', 'Boucherville',
    'Saint-Bruno', 'Sainte-Julie', 'Terrebonne', 'Boisbriand', 'Rosemère',
    'Sainte-Thérèse', 'Deux-Montagnes', 'Lachute', 'Mont-Laurier',
    'Rivière-du-Loup', 'Matane', 'Gaspé', 'Chicoutimi', 'Jonquière',
  ],

  'Manitoba': [
    'Winnipeg', 'Brandon', 'Steinbach', 'Thompson', 'Portage la Prairie',
    'Winkler', 'Morden', 'Selkirk', 'Dauphin', 'The Pas', 'Flin Flon',
    'Swan River', 'Stonewall', 'Kenora', 'Beausejour', 'Gimli',
    'Neepawa', 'Virden', 'Carman', 'Altona', 'Minnedosa', 'Russell',
    'Roblin', 'Boissevain', 'Souris', 'Killarney', 'Arborg',
  ],

  'Saskatchewan': [
    'Saskatoon', 'Regina', 'Prince Albert', 'Moose Jaw', 'Swift Current',
    'Yorkton', 'North Battleford', 'Estevan', 'Weyburn', 'Lloydminster',
    'Melfort', 'Kindersley', 'Humboldt', 'Battleford', 'Martensville',
    'Warman', 'Melville', 'Meadow Lake', 'La Ronge', 'Creighton',
    'Flin Flon', 'Nipawin', 'Tisdale', 'Canora', 'Esterhazy',
    'Moosomin', 'Carlyle', 'Waskatenau', 'Wynyard', 'Outlook',
  ],

  'Nova Scotia': [
    'Halifax', 'Dartmouth', 'Sydney', 'Truro', 'New Glasgow', 'Glace Bay',
    'Yarmouth', 'Amherst', 'Bridgewater', 'Kentville', 'Antigonish',
    'Wolfville', 'Windsor', 'Digby', 'Liverpool', 'Shelburne', 'Pictou',
    'Stellarton', 'Springhill', 'Middleton', 'Berwick', 'Canso',
    'Port Hawkesbury', 'Inverness', 'Baddeck', 'Parrsboro',
  ],

  'New Brunswick': [
    'Moncton', 'Saint John', 'Fredericton', 'Dieppe', 'Riverview',
    'Miramichi', 'Edmundston', 'Bathurst', 'Campbellton', 'Oromocto',
    'Sussex', 'Sackville', 'Woodstock', 'Grand Falls', 'Shippagan',
    'Caraquet', 'Dalhousie', 'Tracadie', 'Bouctouche', 'Shediac',
    'Beresford', 'Blacks Harbour', 'St. Andrews', 'Hartland',
  ],

  'Newfoundland and Labrador': [
    'St. John\'s', 'Mount Pearl', 'Corner Brook', 'Conception Bay South',
    'Paradise', 'Grand Falls-Windsor', 'Gander', 'Happy Valley-Goose Bay',
    'Labrador City', 'Stephenville', 'Marystown', 'Carbonear', 'Clarenville',
    'Bay Roberts', 'Placentia', 'Bonavista', 'Twillingate', 'Fogo Island',
    'Channel-Port aux Basques', 'Springdale', 'Deer Lake',
  ],

  'Prince Edward Island': [
    'Charlottetown', 'Summerside', 'Stratford', 'Cornwall', 'Montague',
    'Souris', 'Alberton', 'Kensington', 'O\'Leary', 'Georgetown',
  ],
};

function getCities(province) {
  return PROVINCES[province] || [];
}

function getProvinceNames() {
  return Object.keys(PROVINCES);
}

module.exports = { PROVINCES, getCities, getProvinceNames };
