import asyncio
from app.db.session import AsyncSessionLocal
from app.models.user import User, UserRole
from app.core.security import hash_password
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(User).where(User.role == UserRole.TEACHER))
        teacher = res.scalar_one_or_none()
        if teacher:
            print(f"Teacher found: email={teacher.email}")
            teacher.email = "teacher@englishlife.uz"
            teacher.password_hash = hash_password("ChangeMe123!")
            await db.commit()
            print("Reset teacher email to teacher@englishlife.uz and password to ChangeMe123!")
        else:
            print("No teacher found!")

if __name__ == "__main__":
    asyncio.run(main())
