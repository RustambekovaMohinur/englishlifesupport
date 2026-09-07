import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class PlatformFeedbackCreate(BaseModel):
    rating: int = Field(ge=1, le=5, description="1 to 5 star rating")
    category: str = Field(min_length=2, max_length=50, description="Feedback category, e.g. UI/UX, Audio, Bug, Feature")
    message: str = Field(min_length=3, max_length=2000, description="Detailed feedback message")


class PlatformFeedbackOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_full_name: str
    user_role: str
    rating: int
    category: str
    message: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PlatformFeedbackStats(BaseModel):
    average_rating: float = 5.0
    total_reviews: int = 0
    rating_distribution: dict[str, int] = {}
