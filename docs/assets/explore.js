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
    { name: "Creations Shop", area: "World Celebration", note: "EPCOT's biggest store, near Spaceship Earth", lorcana: true },
    { name: "Mitsukoshi Department Store", area: "Japan", note: "Anime, Japanese snacks, figures and Totoro" },
    { name: "Souvenirs de France", area: "France", note: "Remy and Ratatouille things, right by the ride" },
    { name: "The Crown & Crest", area: "United Kingdom", note: "Beatles, tea and British pop culture" },
    { name: "Disney Traders", area: "World Showcase entrance", note: "Pins and park-exclusive items" },
  ],
  "magic-kingdom": [
    { name: "The Emporium", area: "Main Street, U.S.A.", note: "The park's biggest store; holiday ornaments in November", lorcana: true },
    { name: "Main Street Confectionery", area: "Main Street, U.S.A.", note: "Watch them make candy; crispy treats and fudge" },
    { name: "Memento Mori", area: "Liberty Square", note: "Haunted Mansion everything" },
    { name: "Frontier Trading Post", area: "Frontierland", note: "The best pin selection in the park" },
    { name: "Big Top Souvenirs", area: "Storybook Circus", note: "Sweets and Dumbo things, usually quiet" },
  ],
  "hollywood-studios": [
    { name: "Mickey's of Hollywood", area: "Hollywood Boulevard", note: "The Studios' biggest store, by the entrance", lorcana: true },
    { name: "Dok-Ondar's Den of Antiquities", area: "Star Wars: Galaxy's Edge", note: "Legacy lightsabers, holocrons and kyber crystals" },
    { name: "Droid Depot", area: "Star Wars: Galaxy's Edge", note: "Build your own R2 or BB droid" },
    { name: "Once Upon a Time", area: "Sunset Boulevard", note: "Vintage-style Disney clothes and home things" },
    { name: "Keystone Clothiers", area: "Hollywood Boulevard", note: "Some of the best Disney T-shirts on property" },
  ],
};
