import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class PlatformFeedbackCreate(BaseModel):
    rating: int = Field(ge=1, le=5, description="1 to 5 star rating")
    what_works_well: str | None = Field(default=None, max_length=3000, description="What is great about the site")
    what_to_improve: str | None = Field(default=None, max_length=3000, description="What needs improvement")
    category: str | None = Field(default="Platform Experience", max_length=50)
    message: str | None = Field(default=None, max_length=3000)


class PlatformFeedbackOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_full_name: str
    user_role: str
    rating: int
    what_works_well: str | None = None
    what_to_improve: str | None = None
    category: str | None = None
    message: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PlatformFeedbackSummary(BaseModel):
    average_rating: float = 5.0
    total_reviews: int = 0
    rating_distribution: dict[str, int] = {}
    user_has_reviewed: bool = False
    user_review: PlatformFeedbackOut | None = None


class PlatformFeedbackStats(BaseModel):
    average_rating: float = 5.0
    total_reviews: int = 0
    rating_distribution: dict[str, int] = {}
