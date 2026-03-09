import type { BBPrompt } from '@boredless/shared';

/**
 * Bluff Battle prompt bank.
 * Each prompt has a question and a correct answer.
 * Players will submit FAKE answers to fool others.
 */
export const PROMPTS: BBPrompt[] = [
  { id: 1, question: "What is the world's smallest country by area?", correctAnswer: "Vatican City" },
  { id: 2, question: "What does the 'D' in D-Day stand for?", correctAnswer: "Day (it literally means Day-Day)" },
  { id: 3, question: "What animal can hold its breath the longest?", correctAnswer: "Cuvier's beaked whale (3+ hours)" },
  { id: 4, question: "What is the fear of long words called?", correctAnswer: "Hippopotomonstrosesquippedaliophobia" },
  { id: 5, question: "What color is a hippo's sweat?", correctAnswer: "Red/orange" },
  { id: 6, question: "How many hearts does an octopus have?", correctAnswer: "Three" },
  { id: 7, question: "What was the first toy advertised on television?", correctAnswer: "Mr. Potato Head" },
  { id: 8, question: "What is the longest word in English with no repeated letters?", correctAnswer: "Uncopyrightable" },
  { id: 9, question: "What fruit was originally called a 'Chinese gooseberry'?", correctAnswer: "Kiwi" },
  { id: 10, question: "How long is New Zealand's longest place name?", correctAnswer: "85 letters (Taumatawhakatangihangakoauauotamateaturipukakapikimaungahoronukupokaiwhenuakitanatahu)" },
  { id: 11, question: "What is the only planet that spins clockwise?", correctAnswer: "Venus" },
  { id: 12, question: "What was Google's original name?", correctAnswer: "BackRub" },
  { id: 13, question: "What is the national animal of Scotland?", correctAnswer: "Unicorn" },
  { id: 14, question: "How many noses does a slug have?", correctAnswer: "Four" },
  { id: 15, question: "What was the first item sold on eBay?", correctAnswer: "A broken laser pointer" },
  { id: 16, question: "What is a group of flamingos called?", correctAnswer: "A flamboyance" },
  { id: 17, question: "What percentage of the Earth's water is fresh water?", correctAnswer: "About 3%" },
  { id: 18, question: "What is the longest hiccuping spree recorded?", correctAnswer: "68 years (Charles Osborne)" },
  { id: 19, question: "What animal's fingerprints are virtually indistinguishable from humans?", correctAnswer: "Koala" },
  { id: 20, question: "What country has the most vending machines per capita?", correctAnswer: "Japan" },
  { id: 21, question: "What is the loudest animal on Earth?", correctAnswer: "Sperm whale (230 decibels)" },
  { id: 22, question: "How many bones does a shark have?", correctAnswer: "Zero (cartilage only)" },
  { id: 23, question: "What is the oldest known board game?", correctAnswer: "Senet (ancient Egypt, ~3100 BC)" },
  { id: 24, question: "What does 'OK' originally stand for?", correctAnswer: "Oll Korrect (a misspelling joke from 1839)" },
  { id: 25, question: "What is the most stolen food in the world?", correctAnswer: "Cheese" },
  { id: 26, question: "How long would it take to walk to the Moon?", correctAnswer: "About 9 years" },
  { id: 27, question: "What is the only letter that doesn't appear in any US state name?", correctAnswer: "Q" },
  { id: 28, question: "What was the first video uploaded to YouTube?", correctAnswer: "Me at the zoo" },
  { id: 29, question: "How many dimples does an average golf ball have?", correctAnswer: "336" },
  { id: 30, question: "What animal can sleep for three years straight?", correctAnswer: "Snail" },
  { id: 31, question: "What is the most common letter in the English language?", correctAnswer: "E" },
  { id: 32, question: "What body part never stops growing?", correctAnswer: "Nose and ears" },
  { id: 33, question: "What country eats the most chocolate per capita?", correctAnswer: "Switzerland" },
  { id: 34, question: "How fast does a sneeze travel?", correctAnswer: "About 100 mph" },
  { id: 35, question: "What is the smallest bone in the human body?", correctAnswer: "Stapes (in the ear)" },
  { id: 36, question: "What color are airplane black boxes actually?", correctAnswer: "Bright orange" },
  { id: 37, question: "How many taste buds does the average human have?", correctAnswer: "About 10,000" },
  { id: 38, question: "What animal has the longest pregnancy?", correctAnswer: "Elephant (22 months)" },
  { id: 39, question: "What is the rarest blood type?", correctAnswer: "AB negative" },
  { id: 40, question: "What was the shortest war in history?", correctAnswer: "Anglo-Zanzibar War (38-45 minutes)" },
  { id: 41, question: "What percentage of the ocean has been explored?", correctAnswer: "About 5%" },
  { id: 42, question: "What was the first message sent over the Internet?", correctAnswer: "LO (tried to send LOGIN but crashed after 2 letters)" },
  { id: 43, question: "What fruit floats in water because it is 25% air?", correctAnswer: "Apple" },
  { id: 44, question: "How many languages are written from right to left?", correctAnswer: "About 12" },
  { id: 45, question: "What is the most visited website in the world?", correctAnswer: "Google" },
  { id: 46, question: "What animal's eye is bigger than its brain?", correctAnswer: "Ostrich" },
  { id: 47, question: "What is the hottest planet in our solar system?", correctAnswer: "Venus (not Mercury)" },
  { id: 48, question: "How many muscles does a cat have in each ear?", correctAnswer: "32" },
  { id: 49, question: "What is the world record for most T-shirts worn at once?", correctAnswer: "260" },
  { id: 50, question: "What animal can see behind itself without turning its head?", correctAnswer: "Rabbit" },
  { id: 51, question: "What does the 'ZIP' in ZIP code stand for?", correctAnswer: "Zone Improvement Plan" },
  { id: 52, question: "How many possible combinations are there on a Rubik's Cube?", correctAnswer: "43 quintillion (43,252,003,274,489,856,000)" },
  { id: 53, question: "What country has more pyramids than Egypt?", correctAnswer: "Sudan" },
  { id: 54, question: "What is the most expensive spice in the world by weight?", correctAnswer: "Saffron" },
  { id: 55, question: "What percentage of your body weight is bacteria?", correctAnswer: "About 1-3%" },
];

/** Get N random prompts without repeats */
export function getRandomPrompts(count: number, exclude: number[] = []): BBPrompt[] {
  const available = PROMPTS.filter(p => !exclude.includes(p.id));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
