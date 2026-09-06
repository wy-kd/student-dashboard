I want you to BUILD a complete working local-first university productivity web application for me.

Do not just design a mock-up, produce a specification or show me example code. I want you to create the actual application, implement the features, test it and maintain the source code in a GitHub repository.

Use the connected GitHub plugin as the source of truth for the project.

Create a new repository for the project if appropriate, with a clear name such as:

student-dashboard

The finished project must be something I can clone onto my Windows laptop, install with npm and run locally.

# PRIMARY REQUIREMENT

This is a personal university management system that will become my main dashboard for managing:

- university subjects
- assignments
- assignment tasks
- assignment progress
- deadlines
- exams
- exam countdowns
- timetable
- classes
- study sessions
- weekly tasks
- important dates
- grades
- semester progress
- workload
- study planning
- priorities
- milestones
- productivity

I want to be able to open the application and immediately understand:

1. What do I need to do today?
2. What should I work on next?
3. What assignments are approaching?
4. How many days are left until each deadline?
5. How many days are left until each exam?
6. Which assessments are most important?
7. Am I ahead, on track, at risk or behind?
8. What classes do I have today?
9. What is my workload over the next few weeks?
10. How much of the semester have I completed?

# LOCAL-FIRST ARCHITECTURE

This application must primarily run on my own computer.

Do NOT make Supabase, Firebase, Vercel, Netlify, AWS or another cloud platform a requirement for core functionality.

Use an architecture suitable for local self-hosting.

Preferred stack:

- Next.js
- React
- TypeScript
- Tailwind CSS
- SQLite
- Prisma ORM

You may change a technology if there is a strong technical reason, but the application must remain easy to run locally.

The database must be stored locally.

All university data should persist after restarting the application.

The application should be able to run with:

npm install

followed by something simple such as:

npm run dev

or

npm run start

# LOCAL NETWORK ACCESS

This is extremely important.

I do not want the application accessible only through:

localhost

Configure it so the development/production server can listen on:

0.0.0.0

This should allow other devices connected to the same Wi-Fi network to access the application through my laptop's local IP address.

For example:

Laptop:
[http://localhost:3000](http://localhost:3000/)

Phone:
[http://192.168.x.x:3000](http://192.168.x.x:3000/)

iPad:
[http://192.168.x.x:3000](http://192.168.x.x:3000/)

Include documentation explaining exactly how I can:

1. find my Windows laptop's local IP
2. start the server
3. access the application from another device
4. allow the application through Windows Firewall if required

Do not expose the application publicly to the internet by default.

# PWA

Turn the application into a Progressive Web App.

I want to be able to open it on my iPhone or iPad and use "Add to Home Screen" so that it behaves more like a standalone application.

Implement:

- web app manifest
- app icons/placeholders
- standalone display
- responsive mobile UI
- appropriate PWA configuration
- installability where supported

The UI must work properly on:

- desktop
- laptop
- iPad
- iPhone

# SECURITY

Although this is a personal local application, use sensible security practices.

It should not expose sensitive information unnecessarily.

If appropriate, implement simple single-user authentication or an application PIN/password.

Do not over-engineer enterprise authentication for a single-user university application.

# DASHBOARD

Create a highly useful dashboard.

The dashboard should prioritise decision-making rather than decorative analytics.

At the top show:

- today's date
- current semester
- current teaching week
- semester progress
- nearest important deadline

Create sections for:

## Today

Show:

- today's classes
- tasks for today
- recommended work
- study sessions
- overdue work

## Upcoming Deadlines

For every deadline show:

- subject
- assessment
- due date
- due time
- days remaining
- weighting
- progress
- status
- priority

Automatically produce human-readable countdowns such as:

Due today

Due tomorrow

Due in 4 days

18 days until final exam

These must calculate automatically from the current date.

# SUBJECTS

Allow creation and management of university subjects.

Each subject should support:

- subject code
- subject name
- semester
- lecturer
- tutor
- colour
- notes
- useful links
- assessments
- weekly content
- tasks
- exams
- study sessions
- grades

Each subject gets its own detailed page.

# ASSIGNMENTS

Create a comprehensive assignment management system.

Each assignment should contain:

- name
- subject
- description
- weighting
- release date
- due date
- due time
- estimated total hours
- actual hours completed
- progress percentage
- priority
- difficulty
- status
- notes
- links

Statuses:

- Not Started
- Planning
- In Progress
- Reviewing
- Ready to Submit
- Submitted

# ASSIGNMENT TASKS

Every assignment should be breakable into smaller tasks.

Example:

IFB240 Security Report

- Read assignment brief
- Analyse rubric
- Research vulnerability
- Complete risk analysis
- Write report
- Check references
- Proofread
- Check against rubric
- Submit

Tasks should support:

- checkbox
- status
- due date
- estimated time
- actual time
- priority
- notes

Use task completion to help calculate assignment progress.

# MILESTONES AND TIMELINES

Allow milestones for larger assessments.

Example:

September 10
Research complete

September 14
Draft complete

September 18
Final review

September 20
Submission

Create a visual assignment timeline.

Determine whether each assignment is:

- Ahead
- On Track
- At Risk
- Behind

Use factors including:

- days remaining
- progress
- estimated work remaining
- completed milestones
- missed milestones

# SMART PRIORITY ENGINE

Create an automatic priority scoring system.

The score should consider:

- days until deadline
- assessment weighting
- current progress
- estimated work remaining
- difficulty
- overdue tasks
- approaching exams

Create a section called:

What Should I Work On?

Rank my university work.

Example:

1. IFB240 Security Report — Critical
2. IFB220 Assignment 2 — High
3. CAB202 Revision — Medium

Give a short explanation for each ranking.

Do not make this an AI API dependency.

Use transparent local calculation logic first.

# EXAMS

Create an exam tracker.

Each exam should include:

- subject
- exam name
- date
- start time
- duration
- location
- weighting
- topics
- revision progress
- confidence
- notes

Show automatic countdowns.

For example:

18 days until IFB240 Final Exam

Allow exam preparation to be divided into topics.

Topics can have statuses such as:

- Not Started
- Learning
- Revising
- Confident

Support:

- practice exams
- mock exams
- revision tasks

# TIMETABLE

Create a proper university timetable.

Support:

- lectures
- tutorials
- workshops
- practicals
- labs
- study sessions

Each class should contain:

- subject
- day
- start time
- end time
- location
- class type
- notes

Create:

- day view
- week view

Make today's classes obvious.

Support recurring weekly classes.

# CALENDAR

Create an integrated academic calendar.

Support:

- Month view
- Week view
- Day view

Include:

- assignments
- assignment milestones
- exams
- classes
- study sessions
- important dates
- tasks

Use something suitable such as FullCalendar if appropriate.

# TASK MANAGEMENT

Create a central task manager.

Tasks can either be standalone or associated with:

- subject
- assignment
- exam

Tasks should include:

- task
- status
- priority
- due date
- estimated duration
- actual duration
- notes

Views:

- Today
- Tomorrow
- This Week
- Upcoming
- Overdue
- Completed
- By Subject
- By Assignment

# STUDY PLANNER

Allow study sessions to be scheduled.

Each study session should contain:

- subject
- related assignment/exam
- date
- start time
- planned duration
- actual duration
- completed status
- notes

Track study hours by:

- day
- week
- month
- subject

# WORKLOAD FORECAST

Create workload forecasting for:

- 7 days
- 14 days
- 30 days

Use:

- upcoming deadlines
- estimated task hours
- exam dates
- assessment weighting

Detect workload collisions.

Example:

Heavy workload detected from 18–23 September.

3 assessments are due during this period with a combined weighting of 55%.

# GRADES

Create grade tracking.

Each completed assessment can contain:

- score
- maximum score
- percentage
- weighting

Calculate automatically:

- weighted contribution
- current subject grade
- weighting completed
- weighting remaining

Create a target grade calculator.

Example:

Current weighted grade: 74%

Final exam weighting: 40%

Required final exam mark to achieve 75 overall: 76.5%

Ensure these calculations are mathematically correct.

# SEMESTER

Allow semester configuration:

- semester name
- start date
- end date
- first teaching week
- final teaching week
- exam period

Automatically calculate:

- current teaching week
- semester percentage complete
- assignments completed
- assignments remaining
- weighting submitted
- weighting remaining

# IMPORTANT DATES

Support dates such as:

- census date
- holidays
- university breaks
- assignment release dates
- final teaching week
- exam period
- personal academic deadlines

# QUICK ADD

Create a prominent Quick Add control.

I should be able to quickly add:

- Task
- Assignment
- Exam
- Class
- Study Session
- Important Date

Minimise the number of clicks required.

# SEARCH

Create global search across:

- subjects
- assignments
- exams
- tasks
- notes

# ALERTS

Create sensible in-app warnings.

Examples:

Assignment due tomorrow

Exam in 7 days

Overdue task

Assignment behind schedule

Heavy workload next week

Missed milestone

Avoid excessive notifications.

# ANALYTICS

Create useful analytics only.

Possible metrics:

- assignments completed
- task completion
- study hours
- subject study distribution
- assignment progress
- exam preparation
- weekly productivity
- semester progress

Do not fill the interface with decorative charts that provide no useful information.

# UI / UX

The design should feel like a polished modern productivity application.

Take usability inspiration from:

- Linear
- Notion
- Todoist
- Things
- Google Calendar

Do not directly copy them.

Use:

- clean sidebar
- clear typography
- responsive layout
- cards where useful
- strong visual hierarchy
- progress bars
- subtle animations
- light mode
- dark mode

Suggested sidebar:

Dashboard
Today
Tasks
Assignments
Calendar
Timetable
Subjects
Exams
Study
Grades
Analytics
Settings

Prioritise readability and usability over flashy effects.

# DATABASE

Design the SQLite database properly.

Potential entities include:

User
Semester
Subject
Assignment
AssignmentTask
AssignmentMilestone
Exam
ExamTopic
Task
Class
StudySession
Grade
ImportantDate

Use proper relational modelling.

Do not store everything as unstructured JSON if proper relational tables are more appropriate.

Use migrations.

Seed the database with realistic university demo data.

Make it easy to delete all demo information.

# BACKUPS

Because the application contains important university information, include a simple method for backing up the local database.

Ideally support:

- database export
- database backup
- database restore

Document how backups work.

# DATA PORTABILITY

Where practical, support exporting important data.

Examples:

- JSON backup
- CSV export

Avoid locking the user's data into the application.

# RELIABILITY

Implement:

- form validation
- error handling
- loading states
- empty states
- confirmation before destructive actions
- responsive layouts
- accessibility
- useful error messages

Every button shown in the interface should actually work.

Do not leave fake buttons or placeholder functionality unless explicitly identified as future functionality.

# GITHUB

Use GitHub throughout development.

Keep the project organised.

Commit meaningful stages of development.

Maintain:

README.md

The README must contain:

- project overview
- requirements
- installation
- database setup
- how to run
- how to update
- LAN access instructions
- PWA instructions
- backup instructions
- troubleshooting

Do not put passwords, secrets or sensitive information into GitHub.

Use .gitignore correctly.

# DEVELOPMENT APPROACH

Do not stop after producing a design or architecture.

Actually implement the application.

Work autonomously where reasonable.

Do not ask me about minor implementation decisions when a sensible industry-standard choice can be made.

Work through the project approximately in this order:

PHASE 1
Project setup and database architecture

PHASE 2
Application shell, navigation and responsive UI

PHASE 3
Subjects and semesters

PHASE 4
Assignments, tasks and milestones

PHASE 5
Dashboard and Today page

PHASE 6
Timetable and calendar

PHASE 7
Exams and revision tracking

PHASE 8
Study planner

PHASE 9
Grades and calculations

PHASE 10
Priority engine and workload forecasting

PHASE 11
Analytics

PHASE 12
PWA and mobile optimisation

PHASE 13
LAN/local-network support

PHASE 14
Backup/export

PHASE 15
Testing and bug fixing

After each major phase, inspect and test the existing functionality before continuing.

# TESTING

Test actual workflows rather than only checking that pages render.

Test scenarios such as:

Create a semester

Create a subject

Create an assignment

Add tasks to the assignment

Complete tasks

Verify progress changes

Create an exam

Verify exam countdown

Create classes

Verify timetable

Create study sessions

Record a grade

Verify weighted grade calculation

Verify target grade calculation

Verify priority ranking

Verify workload warnings

Delete and edit records

Restart the application and confirm data remains

Test desktop layout

Test tablet layout

Test phone layout

Fix problems you discover.

# FINAL REQUIREMENT

The final result should not merely look like a university productivity application.

It must be a functioning university productivity application that I can genuinely use every day.

At the end of the work, review the entire application from the perspective of a university student.

Remove unnecessary complexity.

Fix obvious UX problems.

Verify the major workflows.

Then provide concise instructions telling me exactly how to clone the GitHub repository onto my Windows laptop and run the application locally.