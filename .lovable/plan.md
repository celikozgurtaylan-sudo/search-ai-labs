

## Database Migration Plan

This plan will create all the necessary database tables, functions, policies, and triggers from the 22 migration files in `supabase/migrations/`. Since the database is currently empty, we need to run all migrations.

### Tables to Create

1. **profiles** - Stores additional user information
   - `id` (UUID, primary key)
   - `user_id` (UUID, references auth.users)
   - `display_name` (TEXT)
   - `created_at`, `updated_at` (timestamps)

2. **projects** - Stores research projects
   - `id` (UUID, primary key)
   - `user_id` (UUID, references auth.users, NOT NULL)
   - `title` (TEXT)
   - `description` (TEXT)
   - `analysis` (JSONB)
   - `archived` (BOOLEAN)
   - `archived_at` (timestamp)
   - `created_at`, `updated_at` (timestamps)

3. **study_participants** - Tracks invited participants
   - `id` (UUID, primary key)
   - `project_id` (UUID)
   - `email` (TEXT)
   - `name` (TEXT)
   - `status` (TEXT: invited/joined/completed/declined)
   - `invitation_token` (TEXT, unique)
   - `token_expires_at` (timestamp)
   - Various timestamps and metadata

4. **study_sessions** - Individual interview sessions
   - `id` (UUID, primary key)
   - `project_id` (UUID)
   - `participant_id` (UUID)
   - `session_token` (TEXT, unique)
   - `status` (TEXT: scheduled/active/completed/cancelled)
   - Various timestamps and metadata

5. **interview_questions** - Structured questions from discussion guides
   - `id` (UUID, primary key)
   - `project_id` (UUID)
   - `session_id` (UUID)
   - `question_text` (TEXT)
   - `question_order` (INTEGER)
   - `section`, `question_type`, `is_follow_up`, etc.
   - Unique constraint on (session_id, question_order)

6. **interview_responses** - Participant answers
   - `id` (UUID, primary key)
   - `session_id` (UUID)
   - `question_id` (UUID)
   - `participant_id` (UUID)
   - `response_text`, `transcription`
   - `video_url`, `video_duration_ms`
   - Various metadata

### Functions to Create

1. **handle_new_user()** - Auto-creates profile on user signup
2. **update_updated_at_column()** - Trigger for auto-updating timestamps
3. **is_valid_participant_token()** - Validates session tokens
4. **validate_participant_token()** - Securely validates and returns participant data
5. **update_participant_status_by_token()** - Allows participants to update their status
6. **get_project_for_session()** - Gets project data for valid participant sessions

### Storage Bucket

- **interview-videos** - For storing interview video recordings
  - File size limit: 500MB
  - Allowed types: video/webm, video/mp4

### RLS Policies

All tables will have Row Level Security enabled with appropriate policies:
- **profiles**: Users can view/create/update their own profile
- **projects**: Users can CRUD their own projects
- **study_participants**: Project owners can manage their participants
- **study_sessions**: Project owners and participants can access appropriately
- **interview_questions/responses**: Project owners can manage their interview data

### Implementation Steps

I will execute one consolidated SQL migration that includes all the changes from the 22 migration files, properly ordered to handle dependencies:

1. Create utility function `update_updated_at_column()`
2. Create `profiles` table with RLS and trigger
3. Create `projects` table with RLS, indexes, and trigger
4. Create `study_participants` table with RLS, indexes, and trigger
5. Create `study_sessions` table with RLS, indexes, and trigger
6. Create `interview_questions` table with RLS, indexes, and trigger
7. Create `interview_responses` table with RLS, indexes, and trigger
8. Create helper functions for token validation
9. Create storage bucket for interview videos
10. Add foreign key constraints
11. Create the auto-profile trigger on auth.users

### Technical Details

```text
Database Tables:
+------------------+     +----------------------+     +--------------------+
|    profiles      |     |      projects        |     | study_participants |
+------------------+     +----------------------+     +--------------------+
| id (PK)          |     | id (PK)              |     | id (PK)            |
| user_id (FK)     |<----| user_id (FK)         |     | project_id (FK) ---|---+
| display_name     |     | title                |     | email              |   |
| timestamps       |     | description          |     | name               |   |
+------------------+     | analysis (JSONB)     |     | status             |   |
                         | archived             |     | invitation_token   |   |
                         | timestamps           |     | timestamps         |   |
                         +----------------------+     +--------------------+   |
                                   |                            |              |
                                   |                            |              |
                                   v                            v              |
                         +----------------------+     +--------------------+   |
                         |   study_sessions     |     | interview_questions|   |
                         +----------------------+     +--------------------+   |
                         | id (PK)              |     | id (PK)            |   |
                         | project_id (FK) -----|-----| project_id (FK) ---|---+
                         | participant_id (FK)  |<----| session_id (FK)    |
                         | session_token        |     | question_text      |
                         | status               |     | question_order     |
                         | timestamps           |     | section            |
                         +----------------------+     | timestamps         |
                                   |                  +--------------------+
                                   |                            |
                                   v                            v
                         +------------------------+
                         |  interview_responses   |
                         +------------------------+
                         | id (PK)                |
                         | session_id (FK)        |
                         | question_id (FK)       |
                         | participant_id (FK)    |
                         | response_text          |
                         | transcription          |
                         | video_url              |
                         | video_duration_ms      |
                         | timestamps             |
                         +------------------------+
```

### Post-Migration

After the migration completes:
1. The TypeScript types file will be automatically regenerated
2. The build errors will be resolved as the tables will exist
3. All services (`participantService`, `projectService`, etc.) will work correctly

