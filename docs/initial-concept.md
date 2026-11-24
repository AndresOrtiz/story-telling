The Collective Story
AI-Powered Interactive Storytelling Experience
1. Project Overview

The Collective Story is an interactive, AI-powered group storytelling platform where up to 10 participants enter a shared virtual room, select their favorite books or movies, and collectively create an original fictional story through a sequence of moral dilemmas.

The platform combines AI-generated storytelling, visual presentation, real-time voting, group decision-making, and personality analysis.

The central concept is that participants don't simply answer hypothetical questions. They make decisions inside an evolving fictional universe, and every decision influences what happens next.

At the end of the experience, the platform generates:

An original story based on the participants' selected books and movies.
A sequence of interconnected moral dilemmas.
An individual voting history for each participant.
A group personality and decision-making analysis.
A final narrated slideshow illustrating the story the group created.

The experience is designed for up to 10 participants and one host, with a configurable number of dilemmas per session.

2. Main User Journey
   Create a room: The host creates a session and shares a joining link or QR code.
   Select books and movies: Each participant submits the stories they like.
   Generate the universe: AI analyzes the selections and creates an original fictional world.
   Generate connected dilemmas: AI creates the configured number of dilemmas, each influenced by previous decisions.
   Individual voting: Participants privately select their preferred answers.
   Group decision and consequences: The platform reveals votes, establishes the group's decision and generates the next story development.
   Final analysis: AI analyzes individual decision patterns and collective behavior.
   Story presentation: AI generates an illustrated, narrated slideshow based on the complete experience.
3. Stage-by-Stage Functionality
   Stage 1 — Create a Room Where Up to 10 People Can Join
   Objective

Create a shared environment where participants can join the same experience using their phones or computers.

Host functionality
The host opens the platform and creates a new session.
The platform generates a unique room code and a shareable URL.
A QR code is displayed on the host's presentation screen.
Participants scan the QR code or open the URL.
Each participant enters a nickname and joins the room.
The host sees a live list of participants as they join.
The host can start the experience once everyone is ready.
Participant functionality
Join without creating an account.
Enter a nickname.
See the other participants who have joined.
Wait in a lobby until the host starts the experience.
Room requirements
Maximum of 10 participants.
One host.
Real-time participant synchronization.
Room status: waiting, in progress, completed.
Prevent additional participants from joining once the experience starts, unless the host explicitly allows it.
Suggested technology
Frontend: Next.js with React.
Backend and database: Supabase.
Real-time communication: Supabase Realtime.
Authentication: Anonymous sessions or temporary participant identities.
QR codes: A QR code generation library.
Stage 2 — Book and Movie Selection
Objective

Understand participants' storytelling preferences and use their selections as creative inspiration for the fictional universe.

Once everyone joins, each participant receives a selection screen.

Participant functionality

Each participant can:

Enter the title of a favorite book.
Enter the title of a favorite movie.
Optionally select additional favorites.
Select up to three books or movies in total.
Confirm their selections.

The selection interface should support both manual text input and suggestions from a movie and book database.

Example
Participant	Selected stories
Participant 1	Harry Potter
Participant 2	The Hunger Games
Participant 3	Interstellar
Participant 4	The Lord of the Rings
Participant 5	The Dark Knight

The selections are stored in the session database and sent to the AI story engine.

What the AI should extract

The AI should identify the narrative and thematic characteristics of the selected stories, including:

Main themes.
Moral conflicts.
Character motivations.
Types of difficult decisions.
Relationships between characters.
Narrative atmosphere.
Ethical questions.

For example, the AI might identify that several participants selected stories involving sacrifice, survival, loyalty, power and personal responsibility.

These themes become the foundation for the original universe.

Suggested technology
Frontend: React selection interface.
Book database: Google Books API or Open Library API.
Movie database: TMDB API.
AI analysis: OpenAI API.
Database: Supabase PostgreSQL.

The AI should use the titles and themes as inspiration, creating original characters, situations and settings rather than reproducing copyrighted plots or characters.

Stage 3 — AI-Generated Original Universe
Objective

Create one original fictional universe that combines the thematic elements of all participants' selections.

The AI receives the collected book and movie selections and generates a coherent fictional environment.

The universe should be created before the first dilemma so that every participant shares the same narrative context.

The AI generates
Universe name: A memorable title for the fictional world.
Setting: The geographical, historical and technological context.
Initial situation: The crisis or event that brings the story to life.
Main conflict: The central problem that participants must resolve.
Characters: Original characters who influence the narrative.
World rules: Important limitations, resources, risks and consequences.
Narrative atmosphere: For example, dystopian, fantasy, science fiction, psychological thriller or adventure.
Visual identity: A consistent visual direction for the presentation.
Example

THE LAST CIVILIZATION

Humanity has survived a global catastrophe. The remaining population lives inside a technologically advanced city governed by an artificial intelligence.

Resources are disappearing, social divisions are growing, and a mysterious group claims that the government is hiding the truth about the catastrophe.

Ten strangers are selected to participate in decisions that will determine the future of civilization.

Important functionality

The AI must maintain a persistent description of the universe. This becomes the foundation for all future dilemma generation.

The universe must not change randomly between slides. New locations, characters and events should be introduced only when they make narrative sense.

Suggested technology
OpenAI API for universe creation and structured story generation.
Supabase for storing universe information.
Image generation API for the initial universe artwork.
JSON structured outputs to ensure the generated universe follows a consistent data format.
Stage 4 — Generate the Connected Dilemmas
Objective

Generate a configurable number of difficult moral dilemmas that form one continuous story.

This is the central AI functionality of the platform.

The host must be able to configure the number of dilemmas before starting the experience.

Session configuration

The system should include an input where the host can specify the number of dilemmas.

Recommended configuration:

Default number: 5 dilemmas.
Minimum: 3 dilemmas.
Maximum: 15 dilemmas.
The AI must generate exactly the number requested.
How dilemma generation works

The AI receives:

The original fictional universe.
The selected books and movies.
The themes extracted from those selections.
The number of dilemmas requested.
All previous dilemmas and group decisions.
The current narrative state.

It then generates the first dilemma.

After the group votes and makes its decision, the AI generates the consequences and updates the narrative state.

The following dilemma is based on the updated story.

This process repeats until the configured number of dilemmas has been completed.

Each dilemma must contain the following elements
Element	Functionality
Dilemma title	A short, engaging title
Story context	Explains the situation
Moral conflict	Presents the difficult decision
Voting question	Asks participants what they would do
Answer options	Presents possible actions
Consequences	Describes possible outcomes
Image	AI-generated illustration of the specific situation
Narrative connection	Links the dilemma to previous decisions
Mandatory image generation for every dilemma

Every dilemma must have its own AI-generated image.

The image should not be a generic background or a repeated illustration. It must represent the specific situation, characters, setting and emotional tension of that dilemma.

Examples:

If the dilemma involves choosing who can enter a shelter, the image should depict the shelter, the people outside and the difficult situation.
If the dilemma involves betraying an ally, the image should depict the characters and the moment of confrontation.
If the dilemma involves sacrificing resources to save someone, the image should communicate the conflict and its stakes.

The image should be generated after the AI creates the dilemma's narrative context.

A consistent visual style should be maintained throughout the experience so all generated images look like scenes from the same fictional universe.

Suggested image generation process
AI generates the dilemma description.
AI generates a detailed visual prompt based on that description.
The image generation service creates the image.
The generated image is stored in cloud storage.
The presentation displays the image alongside the dilemma and voting options.
Suggested technologies
OpenAI API for dilemma generation and image prompt creation.
Image generation API for visual content.
Supabase Storage for image storage.
Supabase PostgreSQL for dilemma data.
Question and answer functionality

The platform should support different question formats, especially multiple-selection questions.

I recommend supporting two formats.

A. Single selection

Participants must choose only one answer.

Example:

You discover that one member of your group has betrayed everyone. What do you do?

A. Confront them immediately.
B. Keep the information secret and investigate.
C. Remove them from the group.
D. Forgive them and give them another chance.
B. Multiple selection

Participants can select more than one answer when the dilemma allows several simultaneous actions.

Example:

Your civilization is facing a major crisis. Which actions should the group take? Select all that apply.

A. Prioritize food distribution.
B. Establish a security force.
C. Negotiate with neighboring communities.
D. Restrict individual freedoms temporarily.
E. Investigate the real cause of the crisis.

For multiple-selection questions, the AI must explicitly specify:

How many answers participants can select.
Whether a minimum or maximum selection is required.
Whether selecting several options is compatible with the situation.

The question format must be determined by the dilemma, not randomly.

The AI must also generate meaningful alternatives. There should not always be an obviously correct answer. Some dilemmas can have equally defensible choices, conflicting values or unexpected trade-offs.

Stage 5 — Real-Time Individual Voting
Objective

Allow every participant to independently express their opinion before the group makes a collective decision.

When the host displays a dilemma, the voting interface automatically appears on all connected participants' devices.

Participant functionality
Read the dilemma.
View the AI-generated image.
Read the voting question.
Select one or multiple answers depending on the question format.
Submit their vote.
Wait until the voting period closes.
Voting requirements
Votes must be private before the voting period closes.
Participants cannot see other people's answers while voting.
The platform displays how many people have submitted their votes.
The host can close voting manually or configure a time limit.
Participants who haven't voted can be reminded.
Once submitted, votes cannot be changed unless the host allows a revote.

For multiple-selection questions, the system must store all selected answers rather than treating the submission as a single choice.

Host screen

The main presentation displays:

Current dilemma.
Generated image.
Voting status.
Number of participants who have submitted their votes.
Remaining voting time, if enabled.
Suggested technology
React for voting interfaces.
Supabase Realtime for live voting synchronization.
Supabase PostgreSQL for storing votes.
Backend validation to prevent duplicate or invalid submissions.
Stage 6 — Group Decision and Consequences
Objective

Transform individual opinions into one collective decision and use that decision to advance the story.

After voting closes, the presentation reveals the results to everyone.

The system displays
Number of votes for each answer.
Percentage distribution.
Most popular option.
Minority opinions.
Differences between participants' decisions.

For multiple-selection questions, the platform displays the number and percentage of participants who selected each option. Because people can select several answers, percentages may add up to more than 100%.

Group decision mechanism

The platform should not automatically assume that the most popular answer is always the final group decision.

Recommended process:

Reveal individual voting results.
Give participants time to discuss their opinions.
Allow the host to open a final group decision.
The group confirms its preferred direction through a collective vote.
The winning decision becomes the official story decision.

For multiple-selection questions, the group can confirm a combination of compatible actions.

The host should be able to manage ties and allow a revote when necessary.

AI-generated consequences

Once the group decision is confirmed, the AI generates a new narrative section explaining what happens.

Example:

The group decided to protect the majority of the population instead of distributing resources equally.

The AI now generates consequences:

A large portion of the population survives.
The abandoned population becomes hostile.
A new rebellion emerges.
The original government begins losing control.
A new moral conflict develops.

These consequences become part of the story memory and influence the next dilemma.

Critical technical requirement

The AI must maintain a structured narrative state after every decision.

This state should contain:

Previous dilemmas.
Individual votes.
Final group decisions.
Consequences.
Current characters and their situations.
Important events.
Unresolved conflicts.
Current condition of the fictional universe.

This prevents the story from becoming disconnected or contradicting itself.

Suggested technology
OpenAI API for consequence generation.
Supabase for storing narrative history.
Supabase Realtime for presenting results.
Backend logic for calculating voting results and validating group decisions.
Stage 7 — Final Personality and Group Analysis
Objective

Analyze how participants made decisions throughout the experience and reveal the behavioral patterns of the group.

This stage transforms the voting history into a personalized experience.

The AI should analyze each participant's choices across all dilemmas.

Individual analysis

For each participant, the AI generates a profile based on observable decision patterns.

Possible dimensions include:

Risk tolerance.
Loyalty and trust.
Individual versus collective priorities.
Preference for rules and authority.
Willingness to sacrifice.
Conflict resolution.
Pragmatism versus idealism.
Willingness to challenge existing options.

The platform can assign an archetype to each participant.

Examples:

Archetype	Observed behavior
The Strategist	Considers long-term consequences
The Protector	Prioritizes the safety of others
The Idealist	Stays committed to core principles
The Rebel	Challenges authority and established rules
The Pragmatist	Prioritizes realistic outcomes
The Diplomat	Looks for compromise and cooperation

The AI should explain each classification using actual decisions made during the experience.

It should also identify changes and contradictions.

For example:

A participant might initially choose individual survival but later decide to sacrifice their own resources to protect another character.

This change can be highlighted as an interesting development.

Group analysis

The platform also generates an overall group profile.

It should identify:

Most common values.
Most controversial decisions.
Areas of agreement.
Areas of disagreement.
Dominant decision-making patterns.
How the group handled difficult situations.
Whether the group became more cooperative or more divided.
Which participants consistently supported minority opinions.
Final presentation of the analysis

The host sees a final analysis screen with individual participant profiles and a collective group report.

The participants can see their own profiles and the shared group analysis.

The analysis must be presented as an interpretation of choices made during the game, not as a scientific personality assessment or psychological diagnosis.

Suggested technology
OpenAI API for qualitative analysis and profile generation.
Backend aggregation for numerical voting statistics.
Supabase for retrieving the complete decision history.
React for displaying individual and group profiles.
Stage 8 — Generated Story with a Narrated Slideshow
Objective

Transform the complete experience into an original illustrated story that the group can watch together.

This is the final stage and the conclusion of the experience.

The AI receives the complete session history and creates a story based on the decisions made by the participants.

The AI should generate
A beginning based on the original fictional universe.
The important events created by the dilemmas.
The group's decisions and their consequences.
The main characters and conflicts.
A climax that incorporates the most important decisions.
An ending determined by the group's overall actions.
Narrated slideshow functionality

Instead of generating a full AI video, the MVP will create a cinematic slideshow.

Each scene contains:

An AI-generated image.
A short narrative section.
Narration explaining what is happening.
Background music or atmospheric sound.
Smooth transitions between scenes.
Example

THE LAST CIVILIZATION

Scene 01 — The Beginning

"When the world collapsed, humanity found refuge behind the walls of the last surviving city. But survival came at a cost..."

Scene 02 — The Consequences

"The decision to abandon thousands of people created a rebellion that would change the future of civilization forever..."

Scene 03 — The Ending

"In the end, the future was not determined by the world they inherited, but by the choices they made together..."

Final output requirements
Approximately 8–15 illustrated scenes, depending on the story length.
Consistent visual style.
Original story with a beginning, middle and ending.
Narration in the selected language.
Background music.
Slideshow playback directly within the platform.
Option to download or share the final presentation.
Suggested technology
OpenAI API for final story and scene script generation.
Image generation API for each scene.
Text-to-speech API for narration.
Supabase Storage for images and audio.
React presentation player for synchronized playback.
Optional FFmpeg-based rendering to export the slideshow as a video file.
4. Complete Suggested Technology Stack

The following stack is recommended for building the first version of the platform.

Layer	Technology	Responsibility
Frontend	Next.js + React	Main application and presentation
Styling	Tailwind CSS	Responsive interface
Backend	Supabase	Backend services and database
Database	PostgreSQL	Users, rooms, votes and story history
Real-time	Supabase Realtime	Live voting and participant synchronization
AI engine	OpenAI API	Universe, dilemmas, consequences and analysis
Book database	Google Books / Open Library	Book search
Movie database	TMDB	Movie search
Image generation	Image generation API	Universe, dilemma and story illustrations
Voice generation	Text-to-speech API	Narrated story
File storage	Supabase Storage	Images and audio
Video export	FFmpeg	Optional final slideshow video
How the Components Communicate

Next.js / React

Host and participant interfaces.

↓

Supabase

Database, authentication, storage and real-time events.

↓

Backend AI Orchestration

Controls the sequence of AI requests and maintains story consistency.

↓

The backend communicates with:

OpenAI API: Story and analysis generation.
Image generation API: Visual generation.
Text-to-speech API: Narration.
FFmpeg: Video export.
Important Technical Considerations

1. AI generation should be controlled by the backend.

The frontend should not directly manage AI prompts or expose API keys. All generation requests should go through secure backend functions.

2. The story must have persistent memory.

Every dilemma and decision must be saved. The AI should receive the relevant story history when generating the next chapter.

3. Image generation should be asynchronous.

Generate and store images before their corresponding slides are displayed. Show a loading screen if generation is still in progress.

4. Voting must be reliable.

Each participant should have one valid submission per dilemma. Database constraints and backend validation should prevent duplicate submissions.

5. The AI must follow a structured output.

Dilemmas, answers, consequences and story chapters should be generated in a predictable JSON format. This makes the presentation easier to render and maintain.

5. Suggested Database Structure

The main database entities should include:

Table	Information stored
Rooms	Room code, host, status, configuration
Participants	Nickname, room ID, participant ID
Selections	Selected books and movies
Universes	Generated universe and world description
Dilemmas	Question, options, image and narrative
Votes	Participant answers for each dilemma
Group decisions	Final decision for each dilemma
Consequences	Generated results of group decisions
Personality profiles	Individual analysis
Group analysis	Collective behavioral analysis
Final stories	Final script, scenes, images and narration

The database should also retain the selected number of dilemmas and the current stage of the session, allowing the experience to resume if the host refreshes the page or temporarily disconnects.

6. Important Product Rules

To maintain a coherent experience, the following rules should be included in the AI generation instructions:

Generate exactly the number of dilemmas configured by the host.
Every dilemma must connect to the original universe.
Every dilemma must consider previous group decisions.
Every dilemma must have its own AI-generated image.
Images must visually represent the specific dilemma.
Questions must support single-selection and multiple-selection formats.
Answer options must present meaningful choices rather than obvious right and wrong answers.
The AI must remember minority opinions, not just majority decisions.
Group decisions must have narrative consequences.
The final story must reflect the actual decisions made during the session.
Individual personality interpretations must be based on recorded decisions.
The final slideshow must have consistent visual direction and narration.
7. Recommended Development Phases
   Phase	Development objective
   1	Room creation and participant joining
   2	Book/movie selection
   3	AI universe generation
   4	Configurable dilemma generation and images
   5	Real-time voting and group decisions
   6	Narrative continuity and consequences
   7	Individual and group analysis
   8	Final narrated slideshow

I recommend completing and testing each phase before moving to the next. The most important technical challenge is ensuring that the AI maintains narrative continuity, not simply generating interesting individual slides.

8. Definition of the Finished MVP

The finished first version should allow a host to:

Create a room for up to 10 participants.
Share a QR code or link.
Collect everyone's favorite books and movies.
Configure how many dilemmas the session will contain.
Generate an original fictional universe.
Generate connected dilemmas with individual AI-generated images.
Display single-choice and multiple-choice questions.
Collect individual votes in real time.
Reveal the results and establish collective decisions.
Generate consequences that influence the next dilemma.
Present individual personality interpretations.
Present an analysis of the group.
Generate an illustrated, narrated slideshow telling the story created by the group.

The final product is not just a presentation generator. It is an interactive storytelling experience in which a group of people collectively creates an original fictional world through their decisions.