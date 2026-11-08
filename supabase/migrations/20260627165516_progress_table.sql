-- Enable UUID generation (safe to run multiple times)
create extension if not exists pgcrypto;

-- =====================================================
-- Upload Progress Table
-- =====================================================

create table if not exists public.upload_progress (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    status text not null default 'running'
        check (
            status in (
                'running',
                'cancel_requested',
                'cancelled',
                'completed',
                'failed'
            )
        ),

    stage text not null default 'starting',
    message text not null default '',

    current integer not null default 0,
    total integer not null default 0,

    error_message text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- =====================================================
-- Row Level Security
-- =====================================================

alter table public.upload_progress
enable row level security;

create policy "Users manage own upload progress"
on public.upload_progress
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);