// "Explore more": other attractions in each park that aren't in the day plan.
// Public, generic park info (no trip details). Check the Disney app for closures and show times.
// level: calm | moderate | thrill   kind: ride | show | walk | film | shop | night show
export const EXPLORE = {
  epcot: [
    { name: "Test Track", area: "World Discovery", kind: "ride", level: "thrill", note: "Design a car, then a fast outdoor lap" },
    { name: "Mission: SPACE (Green)", area: "World Discovery", kind: "ride", level: "moderate", note: "Gentle version; Orange is intense" },
    { name: "Journey Into Imagination with Figment", area: "World Celebration", kind: "ride", level: "calm", note: "Short, silly, rarely a wait" },
    { name: "Living with the Land", area: "World Nature", kind: "ride", level: "calm", note: "Boat through the greenhouses" },
    { name: "The Seas with Nemo & Friends", area: "World Nature", kind: "ride", level: "calm", note: "Clamshell ride into the big aquarium" },
    { name: "Turtle Talk with Crush", area: "World Nature", kind: "show", level: "calm", note: "Live, interactive; about 15 min" },
    { name: "Journey of Water, Inspired by Moana", area: "World Nature", kind: "walk", level: "calm", note: "Interactive water trail" },
    { name: "Gran Fiesta Tour Starring The Three Caballeros", area: "Mexico", kind: "ride", level: "calm", note: "Indoor boat ride, cool break" },
    { name: "The American Adventure", area: "American Adventure", kind: "show", level: "calm", note: "Animatronic history show, a good sit-down" },
    { name: "Canada Far and Wide", area: "Canada", kind: "film", level: "calm", note: "360° film" },
    { name: "Club Cool", area: "World Celebration", kind: "shop", level: "calm", note: "Free Coca-Cola tastings from around the world" },
  ],
  "magic-kingdom": [
    { name: "Big Thunder Mountain Railroad", area: "Frontierland", kind: "ride", level: "thrill", note: "Bumpy runaway train; Nir's call" },
    { name: "Space Mountain", area: "Tomorrowland", kind: "ride", level: "thrill", note: "Fast in the dark; a Jey pick" },
    { name: "Buzz Lightyear's Space Ranger Spin", area: "Tomorrowland", kind: "ride", level: "calm", note: "Shooting-gallery dark ride" },
    { name: "Walt Disney's Carousel of Progress", area: "Tomorrowland", kind: "show", level: "calm", note: "Classic, almost never a wait" },
    { name: "\"it's a small world\"", area: "Fantasyland", kind: "ride", level: "calm", note: "Boat ride classic" },
    { name: "Mickey's PhilharMagic", area: "Fantasyland", kind: "show", level: "calm", note: "3D film, good mid-day break" },
    { name: "The Many Adventures of Winnie the Pooh", area: "Fantasyland", kind: "ride", level: "calm", note: "Short and sweet" },
    { name: "Under the Sea ~ Journey of The Little Mermaid", area: "Fantasyland", kind: "ride", level: "calm", note: "Clamshell dark ride" },
    { name: "Mad Tea Party", area: "Fantasyland", kind: "ride", level: "moderate", note: "You control the spin" },
    { name: "Walt Disney's Enchanted Tiki Room", area: "Adventureland", kind: "show", level: "calm", note: "Air-conditioned, 10 min" },
    { name: "Country Bear Musical Jamboree", area: "Frontierland", kind: "show", level: "calm", note: "Animatronic bear concert" },
    { name: "Swiss Family Treehouse", area: "Adventureland", kind: "walk", level: "calm", note: "Climb-through treehouse, lots of stairs" },
  ],
  "hollywood-studios": [
    { name: "Rock 'n' Roller Coaster", area: "Sunset Boulevard", kind: "ride", level: "thrill", note: "Launch coaster; Jey's other solo option" },
    { name: "Slinky Dog Dash", area: "Toy Story Land", kind: "ride", level: "moderate", note: "Family coaster, no loops" },
    { name: "Alien Swirling Saucers", area: "Toy Story Land", kind: "ride", level: "calm", note: "Gentle spinner" },
    { name: "Indiana Jones Epic Stunt Spectacular", area: "Echo Lake", kind: "show", level: "calm", note: "Stunt show; check show times" },
    { name: "Beauty and the Beast – Live on Stage", area: "Sunset Boulevard", kind: "show", level: "calm", note: "Broadway-style, about 25 min" },
    { name: "Dok-Ondar's Den of Antiquities", area: "Galaxy's Edge", kind: "shop", level: "calm", note: "Star Wars collectibles and legacy lightsabers" },
    { name: "Sunset Seasons Greetings", area: "Sunset Boulevard", kind: "night show", level: "calm", note: "Holiday projections on Tower of Terror" },
    { name: "Wonderful World of Animation", area: "Hollywood Boulevard", kind: "night show", level: "calm", note: "Projection show on the Chinese Theater" },
  ],
};

// "Shops": the stores worth a stop in each park. lorcana: the big general stores that sometimes carry
// Disney Lorcana packs (not guaranteed, so the page says to ask). Public park info, no trip details.
export const LORCANA_SURE = { name: "World of Disney", where: "Disney Springs", note: "The one Walt Disney World shop confirmed to sell Lorcana packs and sets. Disney Springs is free to enter and open late." };
export const SHOPS = {
  epcot: [
    { name: "Creations Shop", area: "World Celebration", note: "EPCOT's biggest store, near Spaceship Earth", lorcana: true, lat: 28.3735803, lng: -81.5488539 },
    { name: "Mitsukoshi Department Store", area: "Japan", note: "Anime, Japanese snacks, figures and Totoro", lat: 28.3678414, lng: -81.5506233 },
    { name: "Souvenirs de France", area: "France", note: "Remy and Ratatouille things, right by the ride", lat: 28.3687342, lng: -81.5528942 },
    { name: "The Crown & Crest", area: "United Kingdom", note: "Beatles, tea and British pop culture", lat: 28.3706953, lng: -81.5520394 },
    { name: "Disney Traders", area: "World Showcase entrance", note: "Pins and park-exclusive items", lat: 28.3716257, lng: -81.5489781 },
  ],
  "magic-kingdom": [
    { name: "The Emporium", area: "Main Street, U.S.A.", note: "The park's biggest store; holiday ornaments in November", lorcana: true, lat: 28.4171375, lng: -81.581427 },
    { name: "Main Street Confectionery", area: "Main Street, U.S.A.", note: "Watch them make candy; crispy treats and fudge", lat: 28.4171015, lng: -81.581072 },
    { name: "Memento Mori", area: "Liberty Square", note: "Haunted Mansion everything", lat: 28.4201278, lng: -81.5826377 },
    { name: "Frontier Trading Post", area: "Frontierland", note: "The best pin selection in the park", lat: 28.4187692, lng: -81.5835116 },
    { name: "Big Top Souvenirs", area: "Storybook Circus", note: "Sweets and Dumbo things, usually quiet", lat: 28.4209201, lng: -81.5790435 },
  ],
  "hollywood-studios": [
    { name: "Mickey's of Hollywood", area: "Hollywood Boulevard", note: "The Studios' biggest store, by the entrance", lorcana: true, lat: 28.3579455, lng: -81.5591174 },
    { name: "Dok-Ondar's Den of Antiquities", area: "Star Wars: Galaxy's Edge", note: "Legacy lightsabers, holocrons and kyber crystals", lat: 28.3543042, lng: -81.561915 },
    { name: "Droid Depot", area: "Star Wars: Galaxy's Edge", note: "Build your own R2 or BB droid", lat: 28.3544419, lng: -81.5621813 },
    { name: "Once Upon a Time", area: "Sunset Boulevard", note: "Vintage-style Disney clothes and home things", lat: 28.3584837, lng: -81.5597695 },
    { name: "Keystone Clothiers", area: "Hollywood Boulevard", note: "Some of the best Disney T-shirts on property", lat: 28.3575404, lng: -81.5595607 },
  ],
};

// Snack and food stops worth knowing in each park, for the map's "Shops & food" view. meal: a proper
// quick-service restaurant (fork & knife); the rest are snacks and coffee (cup). Public park info.
export const SNACKS = {
  epcot: [
    { name: "Kringla Bakeri og Kafe", area: "Norway", note: "School bread and lefse", lat: 28.3706428, lng: -81.54691 },
    { name: "Les Halles Boulangerie-Patisserie", area: "France", note: "Croissants, éclairs and baguette sandwiches", lat: 28.3685865, lng: -81.5529844 },
    { name: "Karamell-Küche", area: "Germany", note: "Caramel corn and caramel everything", lat: 28.3684055, lng: -81.5469493 },
    { name: "Refreshment Port", area: "Canada", note: "Poutine and boozy slushies", lat: 28.37188, lng: -81.5508, approx: true },
    { name: "Connections Café", area: "World Celebration", note: "Starbucks coffee and pastries", lat: 28.3741547, lng: -81.5487792 },
  ],
  "magic-kingdom": [
    { name: "Aloha Isle", area: "Adventureland", note: "Dole Whip", lat: 28.41822, lng: -81.58295, approx: true },
    { name: "Gaston's Tavern", area: "Fantasyland", note: "The giant cinnamon roll and LeFou's Brew", lat: 28.4213393, lng: -81.5804385 },
    { name: "Sleepy Hollow", area: "Liberty Square", note: "Sweet waffle sandwiches", lat: 28.4192628, lng: -81.5819914 },
    { name: "Casey's Corner", meal: true, area: "Main Street, U.S.A.", note: "Hot dogs and corn dog nuggets", lat: 28.4179445, lng: -81.5813558 },
    { name: "Main Street Bakery", area: "Main Street, U.S.A.", note: "Starbucks coffee and holiday treats", lat: 28.417348, lng: -81.5810819 },
  ],
  "hollywood-studios": [
    { name: "Milk Stand", area: "Star Wars: Galaxy's Edge", note: "Blue and green milk", lat: 28.3543744, lng: -81.5623373 },
    { name: "Docking Bay 7 Food and Cargo", meal: true, area: "Star Wars: Galaxy's Edge", note: "Proper lunch in the spaceport", lat: 28.3540517, lng: -81.5616011 },
    { name: "Woody's Lunch Box", meal: true, area: "Toy Story Land", note: "Lunch box tarts and the grilled cheese", lat: 28.3557347, lng: -81.5622195 },
    { name: "Trolley Car Café", area: "Hollywood Boulevard", note: "Starbucks coffee", lat: 28.3577437, lng: -81.5596472 },
    { name: "Hollywood Scoops", area: "Sunset Boulevard", note: "Ice cream sandwiches", lat: 28.3591572, lng: -81.560083 },
  ],
};
