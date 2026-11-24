import type { Rating, Tone } from "@cs/schemas";

/** title | year | kind | rating | hopeful(-2)..dark(2) | grounded(-2)..fantastical(2) */
const RAW = `
1984|1949|book|teen|2|-1
A Wrinkle in Time|1962|book|family|-1|2
Alice's Adventures in Wonderland|1865|book|family|-1|2
And Then There Were None|1939|book|teen|2|-2
Anne of Green Gables|1908|book|family|-2|-2
Beloved|1987|book|mature|2|0
Brave New World|1932|book|teen|2|0
Charlotte's Web|1952|book|family|-1|0
Crime and Punishment|1866|book|teen|2|-2
Dracula|1897|book|teen|2|1
Dune|1965|book|teen|1|1
Ender's Game|1985|book|teen|1|1
Fahrenheit 451|1953|book|teen|1|0
Frankenstein|1818|book|teen|2|1
Great Expectations|1861|book|family|0|-2
Jane Eyre|1847|book|teen|0|-2
Kindred|1979|book|mature|2|0
Little Women|1868|book|family|-2|-2
Lord of the Flies|1954|book|teen|2|-2
Matilda|1988|book|family|-1|1
Murder on the Orient Express|1934|book|teen|0|-2
Never Let Me Go|2005|book|teen|2|-1
One Hundred Years of Solitude|1967|book|mature|1|1
Pride and Prejudice|1813|book|family|-2|-2
Station Eleven|2014|book|teen|1|-1
The Alchemist|1988|book|family|-2|0
The Book Thief|2005|book|teen|1|-1
The Catcher in the Rye|1951|book|teen|1|-2
The Chronicles of Narnia|1950|book|family|-1|2
The Count of Monte Cristo|1844|book|teen|1|-2
The Giver|1993|book|teen|1|0
The Great Gatsby|1925|book|teen|1|-2
The Handmaid's Tale|1985|book|mature|2|-1
The Hitchhiker's Guide to the Galaxy|1979|book|family|-2|2
The Hobbit|1937|book|family|-1|2
The Hunger Games|2008|book|teen|1|0
The Kite Runner|2003|book|mature|2|-2
The Left Hand of Darkness|1969|book|teen|0|1
The Little Prince|1943|book|family|-1|1
The Name of the Rose|1980|book|mature|1|-2
The Name of the Wind|2007|book|teen|0|2
The Picture of Dorian Gray|1890|book|teen|2|1
The Road|2006|book|mature|2|-2
The Secret Garden|1911|book|family|-2|-1
The Time Machine|1895|book|family|0|1
To Kill a Mockingbird|1960|book|teen|0|-2
Treasure Island|1883|book|family|-1|-1
Twenty Thousand Leagues Under the Seas|1870|book|family|0|0
Watership Down|1972|book|teen|1|1
Wuthering Heights|1847|book|teen|2|-1
12 Angry Men|1957|movie|family|0|-2
2001: A Space Odyssey|1968|movie|family|1|1
Alien|1979|movie|mature|2|1
Arrival|2016|movie|teen|0|0
Back to the Future|1985|movie|family|-2|1
Blade Runner|1982|movie|mature|2|1
Casablanca|1942|movie|family|0|-2
Children of Men|2006|movie|mature|2|-1
Coco|2017|movie|family|-1|2
E.T. the Extra-Terrestrial|1982|movie|family|-2|1
Encanto|2021|movie|family|-2|2
Everything Everywhere All at Once|2022|movie|mature|0|2
Finding Nemo|2003|movie|family|-2|1
Gattaca|1997|movie|teen|1|0
Gladiator|2000|movie|mature|1|-1
Inception|2010|movie|teen|1|1
Inside Out|2015|movie|family|-1|2
Interstellar|2014|movie|teen|0|0
Jurassic Park|1993|movie|teen|0|1
Knives Out|2019|movie|teen|-1|-2
Mad Max: Fury Road|2015|movie|mature|2|0
Pan's Labyrinth|2006|movie|mature|2|2
Parasite|2019|movie|mature|2|-2
Ratatouille|2007|movie|family|-2|1
Schindler's List|1993|movie|mature|2|-2
Se7en|1995|movie|mature|2|-2
Spirited Away|2001|movie|family|-1|2
Star Wars|1977|movie|family|-1|2
The Dark Knight|2008|movie|teen|2|0
The Godfather|1972|movie|mature|2|-2
The Incredibles|2004|movie|family|-1|1
The Lion King|1994|movie|family|-1|1
The Lord of the Rings|2001|movie|teen|0|2
The Martian|2015|movie|teen|-1|-1
The Matrix|1999|movie|mature|1|1
The Princess Bride|1987|movie|family|-2|1
The Shawshank Redemption|1994|movie|mature|0|-2
The Silence of the Lambs|1991|movie|mature|2|-2
The Social Network|2010|movie|teen|1|-2
The Truman Show|1998|movie|family|0|0
Titanic|1997|movie|teen|1|-2
Toy Story|1995|movie|family|-2|1
Up|2009|movie|family|-1|1
WALL-E|2008|movie|family|-1|1
Whiplash|2014|movie|mature|1|-2
Avatar: The Last Airbender|2005|series|family|-1|2
Battlestar Galactica|2004|series|teen|2|1
Black Mirror|2011|series|mature|2|0
Breaking Bad|2008|series|mature|2|-2
Chernobyl|2019|series|mature|2|-2
Doctor Who|2005|series|family|-1|2
Game of Thrones|2011|series|mature|2|2
Lost|2004|series|teen|1|1
Severance|2022|series|mature|1|0
Sherlock|2010|series|teen|0|-2
Star Trek: The Next Generation|1987|series|family|-2|1
Stranger Things|2016|series|teen|1|1
Ted Lasso|2020|series|mature|-2|-2
The Good Place|2016|series|teen|-2|1
The Last of Us|2023|series|mature|2|0
The Wire|2002|series|mature|2|-2
`;

export type CatalogEntry = { id: string; title: string; year: number; kind: "book" | "movie" | "series"; rating: Rating; tone: Tone };

export const CATALOG: CatalogEntry[] = RAW.trim()
  .split("\n")
  .map((line) => {
    const [title, year, kind, rating, dark, fantastical] = line.split("|");
    return {
      id: `${kind}:${title!.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      title: title!,
      year: Number(year),
      kind: kind as CatalogEntry["kind"],
      rating: rating as Rating,
      tone: { hopefulDark: Number(dark), groundedFantastical: Number(fantastical) },
    };
  });

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

export function searchCatalog(query: string, limit = 8): CatalogEntry[] {
  const q = fold(query.trim());
  if (!q) return [];
  return CATALOG.filter((c) => fold(c.title).includes(q))
    .sort((a, b) => Number(fold(b.title).startsWith(q)) - Number(fold(a.title).startsWith(q)) || a.title.localeCompare(b.title))
    .slice(0, limit);
}

/** Matches a title from any source, so the catalog can supply its rating and tone. */
export const findInCatalog = (title: string) => CATALOG.find((c) => fold(c.title) === fold(title.trim()));

/** Suitable for every group: never lowers or raises the mood much. */
export const SURPRISE_POOL = CATALOG.filter((c) => c.rating !== "mature");
