import pathlib

root = pathlib.Path('C:/Users/User/.gemini/antigravity/scratch/english-life-lms/backend/app/api/routes')

replacements = {
    'assignments.py': [
        ('prefix="/api/assignments"', 'prefix="/assignments"'),
        ('prefix="/api/teacher/assignments"', 'prefix="/teacher/assignments"'),
    ],
    'dashboard.py': [('prefix="/api/dashboard"', 'prefix="/dashboard"')],
    'feedback.py': [('prefix="/api/feedback"', 'prefix="/feedback"')],
    'gamification.py': [('prefix="/api/gamification"', 'prefix="/gamification"')],
    'groups.py': [('prefix="/api/groups"', 'prefix="/groups"')],
    'profile.py': [
        ('prefix="/api/profile"', 'prefix="/profile"'),
        ('prefix="/api/users"', 'prefix="/users"'),
        ('prefix="/api/v1/profile"', 'prefix="/profile"'),
    ],
    'students.py': [
        ('prefix="/api/students"', 'prefix="/students"'),
        ('prefix="/api/teacher/students"', 'prefix="/teacher/students"'),
    ],
    'submissions.py': [('prefix="/api/submissions"', 'prefix="/submissions"')],
    'teachers.py': [('prefix="/api/teachers"', 'prefix="/teachers"')],
    'telegram.py': [('prefix="/api/telegram"', 'prefix="/telegram"')],
}

for fname, reps in replacements.items():
    p = root / fname
    text = p.read_text(encoding='utf-8')
    for old, new in reps:
        if old in text:
            text = text.replace(old, new)
            print(f'  FIXED {fname}: {old!r} -> {new!r}')
        else:
            print(f'  SKIP  {fname}: not found: {old!r}')
    p.write_text(text, encoding='utf-8')

print('All done.')
