Date created: October 14, 2026
Date last modified: October 14, 2026

# Multiple-Choice Questions (Create, Edit, Delete, Preview) - Technical PRD

## Overview/Problem

Teachers can register and log in, but they land on a stub page at `/mcq`. They have nowhere to write questions. This feature replaces that stub with a shared question bank. Every teacher sees all questions in one table, and any teacher can create, edit, delete, preview, and answer any question. Answering a question tells the teacher whether the answer was right. Every question records the teacher who created it, and every answer attempt records the teacher who made it.

## Hypothesis

We believe that a shared question table with create, edit, delete, and an answerable preview will let teachers build and check multiple-choice questions together without leaving the app.

## Scope

### In Scope

- A second migration, `migrations/0002_create-mcq.sql`, that creates three tables: `questions`, `choices`, and `attempts`.
- `questions.user_id` and `attempts.user_id` are foreign keys to `users.id`. `choices.question_id` and `attempts.question_id` are foreign keys to `questions.id`. `attempts.choice_id` is a foreign key to `choices.id`.
- A question has a **name** (a short title) and a **question** (the text the teacher asks). Both are required.
- A question service that can list, get, create, update, and delete questions together with their choices. An attempt service that records an answer and decides whether it was correct. These services are the only modules that query the three new tables.
- HTTP endpoints under `src/app/api/questions/` for list, get, create, update, delete, and record attempt.
- The question bank is shared. Every teacher sees, edits, deletes, previews, and answers every question. There are no ownership checks.
- A question has between 2 and 6 choices. The create form shows 2 choice rows to start, and the teacher can add rows up to 6. Exactly one choice is marked correct, and the teacher marks it while creating the question.
- `/mcq` becomes the question list. It shows a shadcn `Table` with the columns **Name**, **Question**, and **Actions**, a **Create** button, and the existing **Log out** button.
- The Actions column has a three-vertical-dots button (Lucide `EllipsisVertical`) that opens a menu with **Edit**, **Preview**, and **Delete** on every row. Delete asks for confirmation first.
- `/mcq/new` creates a question and `/mcq/[id]/edit` edits one. Both use the same form, with **Save** and **Cancel** buttons.
- `/mcq/[id]/preview` shows the question and its choices as a single-select list with a **Submit** button. Submit records an attempt. The page then shows "Correct answer!" or "Incorrect answer. Try again."
- The server decides whether an answer is correct. The preview page never receives `isCorrect`.
- Register and login send the teacher to `/mcq?userId=<id>` instead of `/mcq`.
- Vitest tests for every phase, written before that phase's implementation, like the previous feature. A phase is done only when its tests pass and its acceptance criteria are checked.

### Out of Scope

- Sessions, cookies, tokens, and `localStorage`. The current user is identified only by the `userId` in the URL and in the requests that need it (see "Identifying the user").
- Ownership and permissions. A question's `user_id` records who created it, but nothing is restricted by it.
- Showing who created or last edited a question.
- Showing attempt history, scores, or statistics. Attempts are recorded but not displayed.
- Quizzes, question ordering, subjects, tags, images, or rich text.
- Questions with more than one correct answer.
- Search, sorting, and pagination on the question table.
- `@cloudflare/vitest-pool-workers`. Unit tests mock D1, and the real local database is checked by hand in Phase 7.

### Cut

- Ownership checks (only the creator can edit or delete). This was considered and removed on purpose: the bank is shared, and any teacher can change any question.
- Protecting the pages and endpoints. Without a session, nothing proves who is making a request. We accept this because session management is out of scope, as it was in the previous feature.
- A database rule that allows only one correct choice per question (a partial unique index on `choices(question_id) WHERE is_correct = 1`). During an edit that moves the correct mark, the update statements run one at a time, so the index would fail partway through. The "exactly one correct" rule is enforced by Zod in the route and checked again in the service.
- Server Actions for mutations. The project rule prefers them, but this feature continues the endpoint and service pattern from the previous feature so the routes can be tested on their own.

## Technical Requirements

### Identifying the user

There is no session, so the browser passes the user id explicitly. The id is used only to record who did something, never to allow or deny it:

1. The register and login responses already return `{ "user": { "id": ... } }`. On success the forms navigate to `/mcq?userId=<user.id>`.
2. Every MCQ page reads `userId` from `searchParams` in its server `page.tsx` and passes it to the client component as a prop. Every link between MCQ pages keeps `?userId=`.
3. Two requests send `userId` in the JSON body, because they write a row that needs it: `POST /api/questions` (stored as `questions.user_id`) and `POST /api/questions/[id]/attempts` (stored as `attempts.user_id`). List, get, update, and delete do not take `userId`.
4. Those two endpoints check that `userId` is 32 lowercase hex characters, which matches the default `users.id` format. An id with no matching user fails the foreign key and returns 404 "User not found."
5. If `/mcq` (or any MCQ page) is opened without `userId`, it shows "Log in to see the questions." and a link to `/login`. It does not call the API.

### Database Schema

Migration `migrations/0002_create-mcq.sql`. Agents apply it locally only. The user applied it to the remote database themselves on October 14, 2026, so remote D1 already has these three tables:

```bash
npx wrangler d1 migrations create my-ai-sprints create-mcq
npx wrangler d1 migrations apply my-ai-sprints --local
```

D1 enforces foreign keys by default. Deleting a question cascades to its choices and attempts. Deleting a user cascades to their questions and attempts.

```sql
CREATE TABLE questions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  question TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE choices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 5),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attempts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  choice_id TEXT NOT NULL REFERENCES choices(id) ON DELETE CASCADE,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_questions_user_id ON questions(user_id);
CREATE INDEX idx_choices_question_id ON choices(question_id);
CREATE INDEX idx_attempts_question_id ON attempts(question_id);
CREATE INDEX idx_attempts_user_id ON attempts(user_id);
```

Notes:

- `name` is a short title shown in the table, for example "Times tables 7". `question` is the text being asked, for example "What is 7 × 8?". Both are required.
- `questions.user_id` is the creator. It does not change when another teacher edits the question.
- `position` (0–5) keeps the choices in the order the teacher entered them.
- `attempts.is_correct` is copied from the choice at the moment the answer is submitted. If someone later moves the correct mark, old attempts keep the result they had when they were made.
- Attempts never change after they are written, so `attempts` has no `updated_at`.
- SQLite does not index foreign-key columns on its own, so the migration adds the four indexes above.
- `0001_create-users.sql` is not modified.

All queries use prepared statements with numbered placeholders (`?1`, `?2`), and rows are read with `all()` and `results[0]`. Multi-statement writes use `db.batch([...])` so they succeed or fail together. Route handlers and client components never call `env.DB`.

### API Endpoints

Routes live under `src/app/api/questions/`. Each handler validates input with Zod 4 before calling a service. In Next.js 16, dynamic `params` is a Promise: `{ params }: { params: Promise<{ id: string }> }`.

Shared validation:

- `userId` (create and attempts only): `/^[0-9a-f]{32}$/`
- `name`: trimmed, 1–200 characters
- `question`: trimmed, 1–1000 characters
- `choices`: an array of 2–6 items. Each item has `text` (trimmed, 1–500 characters) and `isCorrect` (boolean). Exactly one item has `isCorrect: true`. On update, an item may also carry an `id` (32 hex characters).

Responses do not include `user_id`. Nothing in the UI uses it.

A question summary (list):

```json
{
  "id": "q1...",
  "name": "Times tables 7",
  "question": "What is 7 × 8?",
  "createdAt": "2026-10-14 10:00:00",
  "updatedAt": "2026-10-14 10:00:00"
}
```

A question with choices (get, create, update). Each choice includes `isCorrect` only when answers are requested:

```json
{
  "id": "q1...",
  "name": "Times tables 7",
  "question": "What is 7 × 8?",
  "createdAt": "2026-10-14 10:00:00",
  "updatedAt": "2026-10-14 10:00:00",
  "choices": [
    { "id": "c1...", "text": "54", "position": 0, "isCorrect": false },
    { "id": "c2...", "text": "56", "position": 1, "isCorrect": true }
  ]
}
```

#### GET /api/questions

Lists every question, newest first (`ORDER BY created_at DESC`).

**Response:**

- Success (200): `{ "questions": [<question summary>] }`
- Error (500): `{ "error": "Unable to load questions." }`

#### POST /api/questions

Creates a question and its choices in one batch. `userId` is stored as the creator.

**Request body:**

```json
{
  "userId": "<32 hex>",
  "name": "Times tables 7",
  "question": "What is 7 × 8?",
  "choices": [
    { "text": "54", "isCorrect": false },
    { "text": "56", "isCorrect": true }
  ]
}
```

**Response:**

- Success (201): `{ "question": <question with choices, including isCorrect> }`
- Error (400): `{ "error": "Invalid question." }` when any field fails validation, including a missing or malformed `userId`, an empty name or question, zero or two correct choices, fewer than 2 choices, or more than 6
- Error (404): `{ "error": "User not found." }` when the insert fails with a foreign-key error on `user_id`
- Error (500): `{ "error": "Unable to save question." }`

#### GET /api/questions/[id]?includeAnswers=true

Returns one question, with its choices ordered by `position`. The edit page sends `includeAnswers=true`. The preview page leaves it out, so the response has no `isCorrect` fields.

**Response:**

- Success (200): `{ "question": <question with choices> }`
- Error (404): `{ "error": "Question not found." }`
- Error (500): `{ "error": "Unable to load question." }`

#### PUT /api/questions/[id]

Replaces the name, the question text, and the choices. Any teacher can do this. Choice items that have an `id` are updated in place. Items without an `id` are inserted. Existing choices whose `id` is missing from the request are deleted, and so are their attempts (through the cascade). `updated_at` is set on the question and on the updated choices. `user_id` is not changed.

**Request body:**

```json
{
  "name": "Times tables 7",
  "question": "What is 7 × 8?",
  "choices": [
    { "id": "c1...", "text": "54", "isCorrect": false },
    { "id": "c2...", "text": "56", "isCorrect": true },
    { "text": "58", "isCorrect": false }
  ]
}
```

**Response:**

- Success (200): `{ "question": <question with choices, including isCorrect> }`
- Error (400): `{ "error": "Invalid question." }` on a validation failure, or when a choice `id` does not belong to this question
- Error (404): `{ "error": "Question not found." }`
- Error (500): `{ "error": "Unable to save question." }`

#### DELETE /api/questions/[id]

Deletes the question. Any teacher can do this. Its choices and attempts are removed by the cascade.

**Response:**

- Success (200): `{ "ok": true }`
- Error (404): `{ "error": "Question not found." }` when no row was deleted
- Error (500): `{ "error": "Unable to delete question." }`

#### POST /api/questions/[id]/attempts

Records which choice the teacher picked and whether it was correct. The client does not send `isCorrect`. The server reads it from `choices`.

**Request body:**

```json
{
  "userId": "<32 hex>",
  "choiceId": "<32 hex>"
}
```

**Response:**

- Success (201): `{ "attempt": { "id": "a1...", "questionId": "q1...", "choiceId": "c2...", "isCorrect": true, "createdAt": "..." } }`
- Error (400): `{ "error": "Invalid answer." }` when the body is malformed, or when `choiceId` does not belong to this question
- Error (404): `{ "error": "Question not found." }` when the question does not exist, or `{ "error": "User not found." }` when the insert fails with a foreign-key error on `user_id`
- Error (500): `{ "error": "Unable to record answer." }`

### Services

`src/lib/services/question-service.ts` owns every query on `questions` and `choices`.

| Method | Used by | Behavior |
|---|---|---|
| `listQuestions()` | `GET /api/questions` | Returns summaries for all questions, newest first. |
| `getQuestion(id, { includeAnswers })` | `GET /api/questions/[id]` | Returns the question and its ordered choices, or `null`. Omits `isCorrect` unless `includeAnswers` is set. |
| `createQuestion(userId, input)` | `POST /api/questions` | Generates the question id in code, then batches one question insert and one insert per choice. Returns the created question. |
| `updateQuestion(id, input)` | `PUT /api/questions/[id]` | Loads the current question and its choice ids (`QuestionNotFoundError` if missing). Rejects a choice id that is not on this question (`InvalidChoiceError`). Then batches the question update, choice updates, inserts, and deletes. |
| `deleteQuestion(id)` | `DELETE /api/questions/[id]` | Runs `DELETE FROM questions WHERE id = ?1`. If `meta.changes` is 0, it throws `QuestionNotFoundError`. |

`src/lib/services/attempt-service.ts` owns every query on `attempts`.

| Method | Used by | Behavior |
|---|---|---|
| `recordAttempt(userId, questionId, choiceId)` | `POST /api/questions/[id]/attempts` | Checks that the question exists (`QuestionNotFoundError` if not). Loads the choice with `id = ?1 AND question_id = ?2` (`InvalidChoiceError` if there is none). Inserts the attempt with that choice's `is_correct` and returns the attempt. |

Errors live in the question service and are mapped to status codes by the routes: `QuestionNotFoundError` → 404, `InvalidChoiceError` → 400, `UserNotFoundError` → 404. A `FOREIGN KEY constraint failed` error during `createQuestion` or `recordAttempt` becomes `UserNotFoundError`. Both services re-check the rule of 2–6 choices with exactly one correct, so the rule does not depend only on the route.

### User Interface Requirements

Use shadcn components from `src/components/ui/`. The project already has `button`, `card`, `dialog`, `field`, `input`, `label`, `table`, `badge`, and `separator`. This feature adds these generated components (no new npm packages, since Base UI is already installed):

```bash
npx shadcn@latest add @shadcn/dropdown-menu @shadcn/alert-dialog @shadcn/radio-group @shadcn/textarea
```

If one of them produces no files for the Base UI base, stop and report it instead of hand-writing a replacement.

Each `page.tsx` is a Server Component. It awaits `searchParams` (and `params`), then renders a client component with `userId` (and `questionId`) as props. The client components fetch the endpoints. Wide pages use `mx-auto w-full max-w-4xl p-6 md:p-10` instead of the narrow `max-w-sm` auth card.

#### Question list (`/mcq?userId=`)

- Header: title "Multiple-choice questions", a **Create** button that links to `/mcq/new?userId=`, and the existing **Log out** button.
- Loads `GET /api/questions` when it mounts. Shows "Loading questions…" while it waits, and "Unable to load questions." on failure.
- Empty state: "No questions yet. Create the first question."
- Table columns: **Name**, **Question** (truncated to one line), **Actions**. Every teacher's questions appear.
- Actions: a ghost icon `Button` with `EllipsisVertical` and the accessible name "Actions for <question name>". It opens a `DropdownMenu` with these items on every row:
  - **Edit** → `/mcq/<id>/edit?userId=`
  - **Preview** → `/mcq/<id>/preview?userId=`
  - **Delete** → opens an `AlertDialog`: "Delete this question?" with the text "This also deletes its choices and answers." and the buttons **Cancel** and **Delete**. Confirming calls `DELETE /api/questions/<id>`. On success the row is removed from the table. On failure the dialog shows the error message.
- Without `userId`: "Log in to see the questions." and a link to `/login`.

#### Create question (`/mcq/new?userId=`)

Rendered by `QuestionForm` in create mode.

- Fields: **Name** (`Input`, required, 1–200 characters) and **Question** (`Textarea`, required, 1–1000 characters).
- **Choices** in a `FieldSet`, with one `RadioGroup` that selects which choice is correct. Each choice row has a radio labelled "Mark choice N as correct", a text `Input` labelled "Choice N", and a remove icon button labelled "Remove choice N".
- The form starts with 2 empty choice rows and no correct choice selected.
- **Add choice** adds a row. It is disabled at 6 rows. Remove buttons are disabled at 2 rows. Removing the row that was marked correct clears the selection.
- Client validation before submit, shown through `FieldError`: name is required ("Enter a name."); question is required ("Enter the question."); each choice needs text; exactly one choice must be marked correct ("Mark the correct answer.").
- **Save** sends `POST /api/questions` with `userId` and then navigates to `/mcq?userId=`. Server errors (400, 404, 500) appear on the form. Save is disabled while the request is pending.
- **Cancel** navigates to `/mcq?userId=` without saving.

#### Edit question (`/mcq/[id]/edit?userId=`)

- `QuestionForm` in edit mode. It loads `GET /api/questions/[id]?includeAnswers=true` and fills in the name, the question, the choices, and the correct mark.
- The same rules apply as on create. Existing choices keep their `id`, so attempts on unchanged choices survive the edit.
- **Save** sends `PUT /api/questions/[id]` and then returns to the list. **Cancel** returns without saving.
- A 404 shows "Question not found." and a link back to the list.

#### Preview question (`/mcq/[id]/preview?userId=`)

- Loads `GET /api/questions/[id]` without `includeAnswers`.
- Shows the name as the heading, the question text under it, and the choices as a `RadioGroup` in `position` order.
- **Submit** is disabled until a choice is selected. It sends `POST /api/questions/[id]/attempts` with `userId` and `choiceId`.
- The result appears in a live region (`role="status"`): "Correct answer!" when `attempt.isCorrect` is true, otherwise "Incorrect answer. Try again." The teacher can change the selection and submit again. Each submit records a new attempt.
- A **Back to questions** link returns to `/mcq?userId=`.
- A 404 shows "Question not found."

#### Register and login

- The only change is where they navigate on success: `/mcq?userId=${body.user.id}` instead of `/mcq`.

## Testing

Same harness as the previous feature: Vitest (`npm test`), jsdom, Testing Library, and `user-event`. Run `npm test | cat` to keep the summary on screen.

Each phase starts by writing its tests and running `npm test`. That first run is red. The implementation then turns it green. A phase is complete only when its tests pass and its acceptance criteria are checked.

Tests sit next to the code they cover. They assert observable results: SQL and bound values, status codes, response bodies, and what a teacher can see on the page. Service tests mock `getCloudflareContext` (or `@/lib/db`). Route tests mock the services. Component tests mock `fetch` and `next/navigation`. No unit test opens a real D1 database or uses the network.

## Implementation Phases

### Phase 1: Database - COMPLETED

**Objective**: Create `questions`, `choices`, and `attempts` in local D1.

**Tests first**: Write `migrations/create-mcq.test.ts` before the migration exists. `npm test` is red. The test finds `migrations/*_create-mcq.sql` and asserts:

- `questions` has `id`, `user_id`, `name`, `question`, `created_at`, and `updated_at`. `name` and `question` are `NOT NULL`, there is no `description` column, and `user_id` references `users(id)`.
- `choices` has `id`, `question_id`, `text`, `is_correct`, `position`, `created_at`, and `updated_at`, and `question_id` references `questions(id)` with `ON DELETE CASCADE`.
- `attempts` has `id`, `user_id`, `question_id`, `choice_id`, `is_correct`, and `created_at`, with foreign keys to `users`, `questions`, and `choices`.
- The four foreign-key indexes exist.
- `0001_create-users.sql` is unchanged (it still has no reference to these tables).

**Tasks**:

1. Create the migration with `npx wrangler d1 migrations create my-ai-sprints create-mcq`.
2. Write the SQL above and apply it with `--local` only.
3. Re-run `npm test` until `migrations/create-mcq.test.ts` is green.

**Phase acceptance**:

- [x] `npm test` passes `migrations/create-mcq.test.ts`.
- [x] Local D1 lists the three new tables (`npx wrangler d1 execute my-ai-sprints --local --command "SELECT name FROM sqlite_master WHERE type='table'"`).
- [x] The user applied `0002_create-mcq.sql` to the remote database on October 14, 2026. Agents did not run that command.

**Deliverables**:

- `migrations/0002_create-mcq.sql` and `migrations/create-mcq.test.ts`.

### Phase 2: Question and attempt services - COMPLETED

**Objective**: Read and write questions, choices, and attempts without exposing SQL to the routes.

**Tests first**: Write these files before the services exist, with D1 mocked:

`src/lib/services/question-service.test.ts`:

- `listQuestions` returns every question with no `WHERE` clause, newest first, mapped to camelCase summaries without `user_id`.
- `createQuestion` sends one batch with one question insert (binding `userId`, `name`, and `question`) and one choice insert per choice, binds `position` 0..n-1, and stores `is_correct` as 1 for exactly one choice.
- `createQuestion` rejects an empty question text, zero correct choices, two correct choices, 1 choice, and 7 choices without touching the database.
- A `FOREIGN KEY constraint failed` error during create becomes `UserNotFoundError`.
- `getQuestion` orders choices by `position`, leaves out `isCorrect` unless `includeAnswers` is set, and returns `null` for a missing id.
- `updateQuestion` updates choices that have an `id`, inserts choices without one, deletes missing choices, sets `updated_at`, and does not change `user_id`.
- `updateQuestion` throws `QuestionNotFoundError` for a missing question, and `InvalidChoiceError` for a choice id that is not on the question.
- `deleteQuestion` deletes by `id` and throws `QuestionNotFoundError` when `meta.changes` is 0.

`src/lib/services/attempt-service.test.ts`:

- A correct choice inserts an attempt with `is_correct = 1` and returns `isCorrect: true`.
- A wrong choice inserts `is_correct = 0` and returns `isCorrect: false`.
- The attempt binds the answering teacher's `userId`, not the question creator's.
- A choice from another question throws `InvalidChoiceError` and inserts nothing.
- A missing question throws `QuestionNotFoundError` and inserts nothing.

**Tasks**:

1. Implement `src/lib/services/question-service.ts` and its error classes.
2. Implement `src/lib/services/attempt-service.ts`.
3. Re-run `npm test` until both files are green.

**Phase acceptance**:

- [x] `npm test` passes both service test files.
- [x] No module other than these two services queries `questions`, `choices`, or `attempts`.

**Deliverables**:

- `src/lib/services/question-service.ts` and `src/lib/services/question-service.test.ts`.
- `src/lib/services/attempt-service.ts` and `src/lib/services/attempt-service.test.ts`.

### Phase 3: Endpoints - PLANNED

**Objective**: Expose the services over HTTP with validation and stable error bodies.

**Tests first**: Write the route tests before the handlers, with the services mocked:

`src/app/api/questions/route.test.ts`:

- `GET` returns 200 and the list, with no `user_id` in the response.
- `POST` with a valid body returns 201 and the created question, and passes `userId` to `createQuestion`.
- `POST` returns 400 `{ "error": "Invalid question." }` for a missing or malformed `userId`, an empty name, an empty question, a missing question field, 1 choice, 7 choices, zero correct choices, two correct choices, and an empty choice text.
- `POST` returns 404 `{ "error": "User not found." }` when the service throws `UserNotFoundError`.

`src/app/api/questions/[id]/route.test.ts`:

- `GET` returns 200. It passes `includeAnswers: true` only when the query has `includeAnswers=true`. It returns 404 when the service returns `null`.
- `PUT` returns 200 on success, 400 on a validation failure or `InvalidChoiceError`, and 404 on `QuestionNotFoundError`.
- `DELETE` returns 200 `{ "ok": true }` on success and 404 on `QuestionNotFoundError`.

`src/app/api/questions/[id]/attempts/route.test.ts`:

- A valid body returns 201 with `attempt.isCorrect` taken from the service.
- A body that includes `isCorrect` does not change the result. The handler never passes it to the service.
- A malformed `userId` or `choiceId`, or `InvalidChoiceError`, returns 400 `{ "error": "Invalid answer." }`. `QuestionNotFoundError` returns 404.

**Tasks**:

1. Add shared Zod schemas in `src/lib/validation/question.ts`.
2. Implement `src/app/api/questions/route.ts`, `src/app/api/questions/[id]/route.ts`, and `src/app/api/questions/[id]/attempts/route.ts`.
3. Re-run `npm test` until the three route files are green.

**Phase acceptance**:

- [ ] `npm test` passes the three route test files.
- [ ] Correctness comes only from the server.

**Deliverables**:

- The three route handlers and their tests.
- `src/lib/validation/question.ts`.

### Phase 4: Question list page - PLANNED

**Objective**: After login or register, the teacher lands on a table of all questions and can delete any of them.

**Tests first**:

- Update `src/components/login-form.test.tsx` and `src/components/register-form.test.tsx`: success navigates to `/mcq?userId=<id from the response>`.
- Replace the stub assertions in `src/app/mcq/page.test.tsx` with `src/components/mcq/question-list.test.tsx`:
  - The table has the column headers Name, Question, and Actions. Rows show each question's name and question text.
  - An empty list shows "No questions yet. Create the first question."
  - **Create** links to `/mcq/new?userId=<id>`.
  - Every row's "Actions for <name>" menu shows Edit, Preview, and Delete, with links that keep `userId`.
  - Delete opens a confirmation. Cancel sends no request. Confirm sends `DELETE /api/questions/<id>` and removes the row.
  - Without `userId`, the component shows "Log in to see the questions." and does not call `fetch`.
  - Log out is still present.

**Tasks**:

1. Add `dropdown-menu`, `alert-dialog`, `radio-group`, and `textarea` with the shadcn CLI.
2. Change the post-login and post-register navigation.
3. Replace the `/mcq` stub with the list page and the `QuestionList` client component.
4. Re-run `npm test` until the Phase 4 files are green.

**Phase acceptance**:

- [ ] `npm test` passes the Phase 4 test files.
- [ ] The `/mcq` placeholder text is gone.

**Deliverables**:

- `src/app/mcq/page.tsx` and `src/components/mcq/question-list.tsx`, with tests.
- The new shadcn files in `src/components/ui/`.

### Phase 5: Create and edit form - PLANNED

**Objective**: Teachers can create a question with 2–6 choices and one correct answer, and can edit any question.

**Tests first**: `src/components/mcq/question-form.test.tsx`:

- The form has a Name field and a Question field, and no Description field.
- Create mode starts with 2 choice rows. **Add choice** stops at 6. Remove is disabled at 2.
- Save with an empty question shows "Enter the question." and sends no request.
- Save without a marked correct answer shows "Mark the correct answer." and sends no request.
- Save with valid input sends `POST /api/questions` with `userId`, the trimmed `name` and `question`, and exactly one `isCorrect: true`, then navigates to `/mcq?userId=`.
- A 400 from the server shows its error on the form.
- **Cancel** navigates to `/mcq?userId=` and sends no request.
- Edit mode fills in the fields and the correct mark from `GET ...?includeAnswers=true`, and Save sends `PUT` with the existing choice ids and no `userId`.
- Edit mode shows "Question not found." on a 404.

**Tasks**:

1. Build `QuestionForm` with the `Field`, `Input`, `Textarea`, and `RadioGroup` components.
2. Add `src/app/mcq/new/page.tsx` and `src/app/mcq/[id]/edit/page.tsx`.
3. Re-run `npm test` until green.

**Phase acceptance**:

- [ ] `npm test` passes `question-form.test.tsx`.
- [ ] Created and edited questions appear correctly in the list.

**Deliverables**:

- `src/components/mcq/question-form.tsx` and its test.
- `src/app/mcq/new/page.tsx` and `src/app/mcq/[id]/edit/page.tsx`.

### Phase 6: Preview and answer - PLANNED

**Objective**: Any teacher can answer any question and be told whether the answer was correct.

**Tests first**: `src/components/mcq/question-preview.test.tsx`:

- Shows the name, the question text, and the choices in `position` order. Requests the question without `includeAnswers`.
- Submit is disabled until a choice is selected.
- Submit sends `POST /api/questions/<id>/attempts` with `userId` and `choiceId` only.
- `isCorrect: true` shows "Correct answer!", and `isCorrect: false` shows "Incorrect answer. Try again." in the status region.
- Changing the selection and submitting again sends a second attempt.
- **Back to questions** links to `/mcq?userId=`.

**Tasks**:

1. Build `QuestionPreview` and `src/app/mcq/[id]/preview/page.tsx`.
2. Re-run `npm test` until green.

**Phase acceptance**:

- [ ] `npm test` passes `question-preview.test.tsx`.
- [ ] The preview's network responses contain no `isCorrect` for choices.

**Deliverables**:

- `src/components/mcq/question-preview.tsx` and its test.
- `src/app/mcq/[id]/preview/page.tsx`.

### Phase 7: Manual verification - PLANNED

**Objective**: Confirm the whole feature against local D1 before calling it done.

**Tests first**: No new tests. `npm test` must be green before the manual pass starts.

**Tasks**:

1. Run `npm test`, `npm run lint`, and `npm run build`.
2. Log in and confirm that the URL is `/mcq?userId=<id>` and that the table has Name, Question, and Actions columns.
3. Create a question with 2 choices, and another with 6. Confirm that both appear in the table, that Add choice stops at 6, and that `questions.user_id` is the logged-in teacher.
4. Try to save without a question text, and then without a correct answer, and confirm the form blocks both.
5. Edit a question: rename it, change the question text, move the correct mark, and add and remove a choice. Confirm the list and the edit form show the changes.
6. Preview a question. Submit a wrong answer, then the right one. Confirm both messages, and confirm two rows in `attempts` with `is_correct` 0 and then 1.
7. Delete a question and confirm that its `choices` and `attempts` rows are gone.
8. Register a second teacher. Confirm they see the first teacher's questions, and that they can edit, preview, answer, and delete them. Confirm their attempt rows carry their own `user_id`, and that `questions.user_id` stays the first teacher after their edit.
9. Open `/mcq` without `userId` and confirm the login prompt.

**Phase acceptance**:

- [ ] `npm test`, `npm run lint`, and `npm run build` pass.
- [ ] Every manual check above passed.
- [ ] The feature acceptance criteria are checked.

**Deliverables**:

- A green suite and a completed manual pass.

## Technical Implementation Details

### Key Files

- `migrations/0002_create-mcq.sql` — the `questions`, `choices`, and `attempts` tables. Covered by `migrations/create-mcq.test.ts`.
- `src/lib/services/question-service.ts` — question and choice CRUD and the error classes.
- `src/lib/services/attempt-service.ts` — records attempts and decides correctness.
- `src/lib/validation/question.ts` — Zod schemas shared by the routes.
- `src/app/api/questions/route.ts` — `GET` list and `POST` create.
- `src/app/api/questions/[id]/route.ts` — `GET`, `PUT`, and `DELETE`.
- `src/app/api/questions/[id]/attempts/route.ts` — `POST` attempt.
- `src/app/mcq/page.tsx`, `src/app/mcq/new/page.tsx`, `src/app/mcq/[id]/edit/page.tsx`, and `src/app/mcq/[id]/preview/page.tsx` — server pages that read `userId` and render the client components.
- `src/components/mcq/question-list.tsx`, `question-form.tsx`, and `question-preview.tsx` — client components.
- `src/components/login-form.tsx` and `src/components/register-form.tsx` — success navigation now includes `userId`.

### Implementation Patterns

Create a question and its choices atomically:

```typescript
const questionId = crypto.randomUUID().replaceAll("-", "");
await db.batch([
  db
    .prepare(`INSERT INTO questions (id, user_id, name, question) VALUES (?1, ?2, ?3, ?4)`)
    .bind(questionId, userId, input.name, input.question),
  ...input.choices.map((choice, position) =>
    db
      .prepare(
        `INSERT INTO choices (question_id, text, is_correct, position) VALUES (?1, ?2, ?3, ?4)`,
      )
      .bind(questionId, choice.text, choice.isCorrect ? 1 : 0, position),
  ),
]);
```

List every question:

```typescript
const { results } = await db
  .prepare(
    `SELECT id, name, question, created_at, updated_at
     FROM questions
     ORDER BY created_at DESC`,
  )
  .all<QuestionSummaryRow>();
```

Correctness comes from the database, not the request:

```typescript
const { results } = await db
  .prepare(`SELECT is_correct FROM choices WHERE id = ?1 AND question_id = ?2`)
  .bind(choiceId, questionId)
  .all<{ is_correct: number }>();
```

A page reads `userId` on the server and passes it down:

```tsx
export default async function McqPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const { userId } = await searchParams;
  return <QuestionList userId={userId ?? null} />;
}
```

### Important Notes

- The `userId` in the URL is not authentication, and it grants nothing. It only fills `questions.user_id` on create and `attempts.user_id` on answer. Do not add cookies, `localStorage`, or middleware in this feature.
- Do not add ownership checks. Any teacher can edit or delete any question.
- Never send `isCorrect` to the preview page, and never accept it from the attempts request.
- D1 stores booleans as `0`/`1`. Convert to `true`/`false` in the service, not in the route.
- Removing a choice during an edit deletes its attempts, including attempts made by other teachers. Keep choice ids stable in the form so unchanged choices keep their history.
- `crypto.randomUUID().replaceAll("-", "")` produces the same 32-hex format as the table default, so ids look the same whichever path created them.
- Apply migrations with `--local` only. Do not deploy.

## Acceptance Criteria

- [ ] `questions`, `choices`, and `attempts` exist in local D1 with the foreign keys and indexes above. `questions` has a required `name` and a required `question`, and no `description`.
- [ ] Questions and attempts store `user_id` as a foreign key to `users.id`. No cookie, session, or token is added.
- [ ] Login and register open `/mcq?userId=<id>`, which shows every teacher's questions in a table with Name, Question, and Actions.
- [ ] Every row's Actions menu (three vertical dots) offers Edit, Preview, and Delete.
- [ ] Create opens a form with Name, Question, and 2 choice rows. It allows up to 6 choices, requires the name, the question, and exactly one correct answer, and has Save and Cancel.
- [ ] Any teacher can edit any question's name, question, choices, and correct answer.
- [ ] Any teacher can delete any question after confirming. The question, its choices, and its attempts are removed.
- [ ] Preview shows the question and its choices with Submit. It records an attempt for the answering teacher and shows "Correct answer!" or "Incorrect answer. Try again."
- [ ] Correctness is decided on the server. The preview never receives `isCorrect`.
- [ ] Validation rejects an empty name or question, fewer than 2 choices, more than 6, and anything other than exactly one correct choice (400).
- [ ] `npm test` passes the full suite. `npm run lint` and `npm run build` succeed.

## Success Metrics

| Metric | Target | How Measured |
|---|---|---|
| Question creation | A teacher creates a valid question in one save | Manual pass through `/mcq/new` |
| Shared bank | A second teacher sees, edits, and answers the first teacher's questions | Manual check with two accounts |
| Answer feedback | Every submit shows the correct/incorrect message and writes one `attempts` row | Manual pass, then inspect `attempts` in local D1 |
| Data integrity | 0 questions with fewer than 2, more than 6, or not exactly 1 correct choice | `SELECT question_id, COUNT(*), SUM(is_correct) FROM choices GROUP BY question_id` |
| Phase gate | Each phase ends with a green Vitest run and its acceptance criteria checked | `npm test` plus the phase checkboxes |

## Dependencies

### External Dependencies

- Cloudflare D1 — binding `DB`, database `my-ai-sprints`, now with the three new tables.
- Zod 4 — already installed. Validates request input.
- Vitest, Testing Library, `user-event`, and jsdom — already installed.
- `lucide-react` — already installed. Provides `EllipsisVertical`, `Plus`, and `X` icons.

### Internal Dependencies

- `src/lib/db.ts` `getDb()` — the only way the services reach D1.
- The `users` table and the `id` returned by register and login.
- `src/components/logout-button.tsx` — reused on the list page.
- shadcn `table`, `button`, `card`, `field`, `input`, plus the new `dropdown-menu`, `alert-dialog`, `radio-group`, and `textarea`. These are generated by the shadcn CLI and need no new npm packages.

No new environment variables or secrets.

## Risks and Mitigation

### Technical Risks

- **Risk**: A partial write leaves a question with no choices, or with old and new choices mixed together.
- **Mitigation**: Create and update use `db.batch`, which runs as one transaction in D1.

- **Risk**: Foreign keys are not enforced locally, so cascades silently do nothing.
- **Mitigation**: Phase 7 deletes a question and checks that its choices and attempts are gone. If they remain, record it in Troubleshooting before going further.

- **Risk**: The correct answer leaks to the client and can be read in the network tab.
- **Mitigation**: `includeAnswers` defaults to off. Route and component tests assert that the preview response has no `isCorrect`.

- **Risk**: A shadcn component does not exist for the Base UI base.
- **Mitigation**: Check that the files were created after each `shadcn add`, and report a missing one instead of hand-writing it.

### User Experience Risks

- **Risk**: A teacher edits or deletes a question another teacher wrote, by mistake or on purpose.
- **Mitigation**: This is the intended shared-bank behavior. Delete asks for confirmation. Revisit ownership when sessions exist.

- **Risk**: Two teachers edit the same question at once, and the later save overwrites the earlier one.
- **Mitigation**: Accepted for this feature (last write wins). Revisit if it happens in practice.

- **Risk**: Someone removes a choice during an edit, and attempts on that choice disappear without warning.
- **Mitigation**: Attempts are not shown in this feature. Revisit (for example, soft-delete choices) when attempt history is shown.

## Troubleshooting Guide

No entries yet. Add one whenever a bug is found and fixed during implementation.

## Notes for AI Agents

When working with this PRD:

1. Read the Overview, the Hypothesis, and "Identifying the user" before writing code.
2. Stay inside Scope. Do not add sessions, cookies, `localStorage`, attempt history screens, or ownership checks.
3. A question has `name` and `question`. There is no `description` field anywhere: not in the schema, the API, or the UI.
4. Routes call services. Services are the only modules that query `questions`, `choices`, and `attempts`.
5. For each phase, write the listed tests first and see them fail, then implement. Mark the phase complete only when its tests are green and its acceptance criteria are checked.
6. Ask before adding any npm dependency. The shadcn components above are generated files, not new packages.
7. Apply migrations with `--local` only. Do not deploy.
8. Update the phase status markers and the Current Status section as work moves forward, and add a Troubleshooting entry for every bug fixed.

## Current Status

**Last Updated**: October 14, 2026
**Current Phase**: Phase 3 - Endpoints
**Status**: PLANNED (Phase 2 COMPLETED: question and attempt services pass their tests. The full suite is green.)
**Next Steps**: Write the route tests, see them fail, and implement the question endpoints.
