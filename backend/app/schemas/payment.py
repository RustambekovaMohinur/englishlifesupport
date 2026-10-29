from datetime import datetime
import uuid
from pydantic import BaseModel, Field


class CreateOrderRequest(BaseModel):
    plan: str = Field(..., description="standard | pro_vip")
    provider: str = Field(default="click", description="click | payme | mock")


class CreateOrderResponse(BaseModel):
    order_id: str
    transaction_id: uuid.UUID
    amount_uzs: int
    plan: str
    provider: str
    token: str
    checkout_url: str


class MockCheckoutRequest(BaseModel):
    order_id: str
    token: str


class PaymentTransactionOut(BaseModel):
    id: uuid.UUID
    provider: str
    provider_transaction_id: str
    plan: str
    amount_uzs: int
    currency: str
    status: str
    created_at: datetime
    completed_at: datetime | None = None
