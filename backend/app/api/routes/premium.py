"""
Premium & Social Ecosystem API routes.
Handles:
- Premium status checks
- Premium plan assignment (teacher/admin)
- Theme/badge preferences update
- Permission checks
"""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.student import StudentProfile
from app.models.user import User, UserRole

logger = logging.getLogger("app.api.routes.premium")

router = APIRouter(prefix="/premium", tags=["premium"])

# ---------- Schemas ----------

VALID_PLANS = {"free", "standard", "pro_vip"}
VALID_BADGES = {None, "", "👑", "⭐", "🕊️", "🔥", "💎"}
VALID_THEMES = {"default", "light", "dark", "cyber_purple", "neon_pink", "emerald_green", "golden_sunset"}

PLAN_PERMISSIONS = {
    "free":     {"can_write_notes": False, "can_private_chat": False, "can_create_groups": False},
    "standard": {"can_write_notes": True,  "can_private_chat": True,  "can_create_groups": False},
    "pro_vip":  {"can_write_notes": True,  "can_private_chat": True,  "can_create_groups": True},
}

PLAN_THEMES = {
    "free":     ["default", "light", "dark"],
    "standard": ["default", "light", "dark", "cyber_purple", "neon_pink", "emerald_green", "golden_sunset"],
    "pro_vip":  ["default", "light", "dark", "cyber_purple", "neon_pink", "emerald_green", "golden_sunset"],
}

PLAN_BADGES = {
    "free":     [],
    "standard": ["⭐"],
    "pro_vip":  ["👑", "🔥", "💎", "⭐", "🕊️"],
}


class PremiumStatusOut(BaseModel):
    student_id: uuid.UUID
    username: str
    full_name: str
    is_premium: bool
    premium_plan: str
    premium_expires_at: datetime | None
    custom_badge: str | None
    profile_bg_theme: str
    can_write_notes: bool
    can_private_chat: bool
    can_create_groups: bool
    available_themes: list[str]
    available_badges: list[str] = []


class SetPremiumPlanRequest(BaseModel):
    student_id: uuid.UUID
    plan: str = Field(..., description="free | standard | pro_vip")
    expires_at: datetime | None = None
    custom_badge: str | None = Field(default=None, max_length=16)


class UpdatePreferencesRequest(BaseModel):
    profile_bg_theme: str | None = Field(default=None, max_length=64)
    custom_badge: str | None = Field(default=None, max_length=16)


# ---------- Helpers ----------

def _apply_plan(profile: StudentProfile, user: User, plan: str, expires_at: datetime | None, badge: str | None) -> None:
    """Apply premium plan to both StudentProfile and User objects."""
    perms = PLAN_PERMISSIONS.get(plan, PLAN_PERMISSIONS["free"])
    is_p = plan != "free"

    for obj in (profile, user):
        obj.is_premium = is_p
        obj.premium_plan = plan
        obj.premium_expires_at = expires_at
        obj.can_write_notes = perms["can_write_notes"]
        obj.can_private_chat = perms["can_private_chat"]
        obj.can_create_groups = perms["can_create_groups"]
        if badge is not None:
            obj.custom_badge = badge or None


def _profile_to_out(profile: StudentProfile, user: User) -> PremiumStatusOut:
    plan = getattr(profile, "premium_plan", "free") or "free"
    return PremiumStatusOut(
        student_id=profile.id,
        username=user.username,
        full_name=profile.full_name,
        is_premium=bool(getattr(profile, "is_premium", False)),
        premium_plan=plan,
        premium_expires_at=getattr(profile, "premium_expires_at", None),
        custom_badge=getattr(profile, "custom_badge", None),
        profile_bg_theme=getattr(profile, "profile_bg_theme", "default") or "default",
        can_write_notes=bool(getattr(profile, "can_write_notes", False)),
        can_private_chat=bool(getattr(profile, "can_private_chat", False)),
        can_create_groups=bool(getattr(profile, "can_create_groups", False)),
        available_themes=PLAN_THEMES.get(plan, PLAN_THEMES["free"]),
        available_badges=PLAN_BADGES.get(plan, []),
    )


# ---------- Endpoints ----------

@router.get("/me", response_model=PremiumStatusOut, summary="Get own premium status")
async def get_my_premium_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns the current user's premium status and permissions."""
    profile = (
        await db.execute(
            select(StudentProfile)
            .options(selectinload(StudentProfile.user))
            .where(StudentProfile.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student profile not found")
    return _profile_to_out(profile, current_user)


@router.patch("/me/preferences", response_model=PremiumStatusOut, summary="Update theme & badge preferences")
async def update_my_preferences(
    body: UpdatePreferencesRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lets premium students switch themes and set their badge."""
    profile = (
        await db.execute(
            select(StudentProfile).where(StudentProfile.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Student profile not found")

    plan = getattr(profile, "premium_plan", "free") or "free"
    allowed_themes = PLAN_THEMES.get(plan, PLAN_THEMES["free"])

    if body.profile_bg_theme is not None:
        if body.profile_bg_theme not in allowed_themes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Theme '{body.profile_bg_theme}' requires a higher plan. Available: {allowed_themes}",
            )
        profile.profile_bg_theme = body.profile_bg_theme
        current_user.profile_bg_theme = body.profile_bg_theme

    if body.custom_badge is not None:
        badge = body.custom_badge.strip() if body.custom_badge else None
        if badge:
            allowed_badges = PLAN_BADGES.get(plan, [])
            if badge not in allowed_badges:
                tier_msg = "Pro VIP (29k UZS)" if badge in ["👑", "🔥", "💎"] else "Standard (19k UZS) or higher"
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Badge '{badge}' requires {tier_msg} plan. Available for your plan: {allowed_badges}",
                )
        profile.custom_badge = badge
        current_user.custom_badge = badge

    await db.commit()
    return _profile_to_out(profile, current_user)


@router.post("/admin/set-plan", response_model=PremiumStatusOut, summary="Admin: assign premium plan")
async def admin_set_premium_plan(
    body: SetPremiumPlanRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Teacher/Admin assigns a premium plan to a student."""
    if current_user.role != UserRole.TEACHER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Teachers only")

    if body.plan not in VALID_PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan. Choose from: {VALID_PLANS}")

    result = await db.execute(
        select(StudentProfile)
        .options(selectinload(StudentProfile.user))
        .where(StudentProfile.id == body.student_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Student not found")

    user = profile.user
    _apply_plan(profile, user, body.plan, body.expires_at, body.custom_badge)

    await db.commit()
    logger.info(
        "Teacher %s set premium plan=%s for student %s (expires=%s)",
        current_user.username, body.plan, profile.full_name, body.expires_at
    )
    return _profile_to_out(profile, user)


@router.get("/themes", summary="List available themes for current user's plan")
async def list_available_themes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns available themes based on the user's premium plan."""
    profile = (
        await db.execute(select(StudentProfile).where(StudentProfile.user_id == current_user.id))
    ).scalar_one_or_none()
    plan = "free"
    if profile:
        plan = getattr(profile, "premium_plan", "free") or "free"

    themes = [
        {"id": "default",        "label": "Default",        "premium": False,  "css_class": "theme-default"},
        {"id": "light",          "label": "Light",          "premium": False,  "css_class": "theme-light"},
        {"id": "dark",           "label": "Dark",           "premium": False,  "css_class": "theme-dark"},
        {"id": "cyber_purple",   "label": "Cyber Purple",   "premium": True,   "css_class": "theme-cyber-purple",   "min_plan": "standard"},
        {"id": "neon_pink",      "label": "Neon Pink",      "premium": True,   "css_class": "theme-neon-pink",      "min_plan": "standard"},
        {"id": "emerald_green",  "label": "Emerald Green",  "premium": True,   "css_class": "theme-emerald-green",  "min_plan": "standard"},
        {"id": "golden_sunset",  "label": "Golden Sunset",  "premium": True,   "css_class": "theme-golden-sunset",  "min_plan": "standard"},
    ]
    allowed = PLAN_THEMES.get(plan, PLAN_THEMES["free"])
    for t in themes:
        t["unlocked"] = t["id"] in allowed

    return {
        "current_plan": plan,
        "themes": themes,
        "available_theme_ids": allowed,
    }
