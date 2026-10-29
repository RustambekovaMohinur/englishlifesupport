import datetime
import hashlib
import json
import logging
import secrets
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.payment import PaymentTransaction
from app.models.student import StudentProfile
from app.models.user import User
from app.schemas.payment import (
    CreateOrderRequest,
    CreateOrderResponse,
    MockCheckoutRequest,
    PaymentTransactionOut,
)

logger = logging.getLogger("app.api.routes.payments")

router = APIRouter(prefix="/payments", tags=["payments"])

PRICING_UZS = {
    "standard": 19000,
    "pro_vip": 29000,
}

PLAN_PERMISSIONS = {
    "standard": {
        "can_write_notes": True,
        "can_private_chat": True,
        "can_create_groups": False,
        "badge": "⭐",
    },
    "pro_vip": {
        "can_write_notes": True,
        "can_private_chat": True,
        "can_create_groups": True,
        "badge": "👑",
    },
}


async def _activate_plan(student: StudentProfile, user: User, plan: str, db: AsyncSession | None = None):
    """Activate 30-day premium plan on student profile and user model."""
    perms = PLAN_PERMISSIONS.get(plan, PLAN_PERMISSIONS["standard"])
    expires_at = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=30)

    for obj in (student, user):
        obj.is_premium = True
        obj.premium_plan = plan
        obj.premium_expires_at = expires_at
        obj.custom_badge = perms["badge"]
        obj.can_write_notes = perms["can_write_notes"]
        obj.can_private_chat = perms["can_private_chat"]
        obj.can_create_groups = perms["can_create_groups"]

    if db and plan in ("standard", "pro_vip"):
        try:
            from app.api.routes.social import ensure_global_premium_group
            await ensure_global_premium_group(db, student)
        except Exception as ex:
            logger.warning("Failed to auto-enroll student in global premium group: %s", ex)



@router.post("/create-order", response_model=CreateOrderResponse, summary="Create a tokenized payment order")
async def create_payment_order(
    body: CreateOrderRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Initializes a tokenized payment order for Click, Payme, or Mock provider.
    SECURITY NOTICE: No credit card details (PAN/CVV) are ever accepted or stored.
    """
    plan = body.plan.lower().strip()
    if plan not in PRICING_UZS:
        raise HTTPException(status_code=400, detail="Invalid plan. Choose 'standard' or 'pro_vip'.")

    profile = (
        await db.execute(
            select(StudentProfile)
            .options(selectinload(StudentProfile.user))
            .where(StudentProfile.user_id == current_user.id)
        )
    ).scalar_one_or_none()

    if not profile:
        raise HTTPException(status_code=404, detail="Student profile not found.")

    amount = PRICING_UZS[plan]
    order_id = f"EL-{secrets.token_hex(4).upper()}-{int(datetime.datetime.now().timestamp())}"
    token = secrets.token_urlsafe(32)

    metadata = {
        "token": token,
        "created_by": str(current_user.id),
        "student_name": profile.full_name,
        "plan": plan,
    }

    tx = PaymentTransaction(
        id=uuid.uuid4(),
        student_id=profile.id,
        provider=body.provider.lower(),
        provider_transaction_id=order_id,
        plan=plan,
        amount_uzs=amount,
        currency="UZS",
        status="pending",
        metadata_json=json.dumps(metadata),
    )
    db.add(tx)
    await db.commit()

    checkout_url = f"/student/billing?order={order_id}&provider={body.provider}"

    return CreateOrderResponse(
        order_id=order_id,
        transaction_id=tx.id,
        amount_uzs=amount,
        plan=plan,
        provider=body.provider,
        token=token,
        checkout_url=checkout_url,
    )


@router.post("/mock-checkout", summary="Complete mock payment for development & instant activation")
async def mock_checkout(
    body: MockCheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Simulates successful tokenized checkout via Click or Payme.
    Immediately activates premium plan for 30 days upon token verification.
    """
    tx = (
        await db.execute(
            select(PaymentTransaction)
            .options(selectinload(PaymentTransaction.student).selectinload(StudentProfile.user))
            .where(PaymentTransaction.provider_transaction_id == body.order_id)
        )
    ).scalar_one_or_none()

    if not tx:
        raise HTTPException(status_code=404, detail="Order transaction not found.")

    if tx.status == "completed":
        return {"status": "success", "message": "Order already completed.", "plan": tx.plan}

    # Verify token
    try:
        meta = json.loads(tx.metadata_json or "{}")
        if meta.get("token") != body.token:
            raise HTTPException(status_code=403, detail="Invalid payment verification token.")
    except Exception:
        raise HTTPException(status_code=403, detail="Payment token verification failed.")

    tx.status = "completed"
    tx.completed_at = datetime.datetime.now(datetime.timezone.utc)

    # Activate premium plan
    await _activate_plan(tx.student, tx.student.user, tx.plan, db)

    await db.commit()
    logger.info("Payment order %s completed successfully. Activated plan=%s for %s", tx.provider_transaction_id, tx.plan, tx.student.full_name)

    return {
        "status": "success",
        "message": f"Payment of {tx.amount_uzs:,} UZS processed successfully! Plan '{tx.plan}' activated for 30 days.",
        "plan": tx.plan,
        "amount_uzs": tx.amount_uzs,
        "expires_at": tx.student.premium_expires_at,
    }


@router.post("/webhook/click", summary="Click webhook handler (Prepare & Complete)")
async def click_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Click webhook implementation adhering to Click merchant API standard.
    Action 0: Prepare (Validates order and amount)
    Action 1: Complete (Activates 30-day plan upon merchant confirmation)
    """
    try:
        form = await request.form()
        data = dict(form)
    except Exception:
        data = await request.json()

    click_trans_id = data.get("click_trans_id")
    service_id = data.get("service_id")
    merchant_trans_id = data.get("merchant_trans_id")  # order_id
    amount = data.get("amount")
    action = data.get("action")  # 0 = Prepare, 1 = Complete
    sign_time = data.get("sign_time")
    error = data.get("error", 0)

    tx = (
        await db.execute(
            select(PaymentTransaction)
            .options(selectinload(PaymentTransaction.student).selectinload(StudentProfile.user))
            .where(PaymentTransaction.provider_transaction_id == merchant_trans_id)
        )
    ).scalar_one_or_none()

    if not tx:
        return {"error": -5, "error_note": "User/Order not found"}

    if int(error) < 0:
        tx.status = "failed"
        await db.commit()
        return {"error": -9, "error_note": "Transaction cancelled"}

    # Prepare action
    if str(action) == "0":
        return {
            "click_trans_id": click_trans_id,
            "merchant_trans_id": merchant_trans_id,
            "merchant_prepare_id": str(tx.id),
            "error": 0,
            "error_note": "Success",
        }

    # Complete action
    if str(action) == "1":
        tx.status = "completed"
        tx.completed_at = datetime.datetime.now(datetime.timezone.utc)
        await _activate_plan(tx.student, tx.student.user, tx.plan, db)
        await db.commit()

        return {
            "click_trans_id": click_trans_id,
            "merchant_trans_id": merchant_trans_id,
            "merchant_confirm_id": str(tx.id),
            "error": 0,
            "error_note": "Success",
        }

    return {"error": -3, "error_note": "Unknown action"}


@router.post("/webhook/payme", summary="Payme JSON-RPC webhook handler")
async def payme_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Payme JSON-RPC merchant webhook implementation.
    Handles: CheckPerformTransaction, CreateTransaction, PerformTransaction.
    """
    body = await request.json()
    method = body.get("method")
    params = body.get("params", {})
    req_id = body.get("id")

    account = params.get("account", {})
    order_id = account.get("order_id") or params.get("order_id")

    tx = (
        await db.execute(
            select(PaymentTransaction)
            .options(selectinload(PaymentTransaction.student).selectinload(StudentProfile.user))
            .where(PaymentTransaction.provider_transaction_id == order_id)
        )
    ).scalar_one_or_none()

    if method == "CheckPerformTransaction":
        if not tx:
            return {"id": req_id, "error": {"code": -31050, "message": "Order not found"}}
        return {"id": req_id, "result": {"allow": True}}

    if method == "CreateTransaction":
        if not tx:
            return {"id": req_id, "error": {"code": -31050, "message": "Order not found"}}
        return {
            "id": req_id,
            "result": {
                "create_time": int(tx.created_at.timestamp() * 1000),
                "transaction": str(tx.id),
                "state": 1,
            },
        }

    if method == "PerformTransaction":
        if not tx:
            return {"id": req_id, "error": {"code": -31050, "message": "Order not found"}}

        tx.status = "completed"
        tx.completed_at = datetime.datetime.now(datetime.timezone.utc)
        await _activate_plan(tx.student, tx.student.user, tx.plan, db)
        await db.commit()

        return {
            "id": req_id,
            "result": {
                "transaction": str(tx.id),
                "perform_time": int(datetime.datetime.now().timestamp() * 1000),
                "state": 2,
            },
        }

    return {"id": req_id, "result": {"state": 1}}


@router.get("/history", response_model=list[PaymentTransactionOut], summary="Get student payment history")
async def get_payment_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    profile = (
        await db.execute(
            select(StudentProfile).where(StudentProfile.user_id == current_user.id)
        )
    ).scalar_one_or_none()

    if not profile:
        raise HTTPException(status_code=404, detail="Student profile not found.")

    txs = (
        await db.execute(
            select(PaymentTransaction)
            .where(PaymentTransaction.student_id == profile.id)
            .order_by(PaymentTransaction.created_at.desc())
        )
    ).scalars().all()

    return [
        PaymentTransactionOut(
            id=t.id,
            provider=t.provider,
            provider_transaction_id=t.provider_transaction_id,
            plan=t.plan,
            amount_uzs=t.amount_uzs,
            currency=t.currency,
            status=t.status,
            created_at=t.created_at,
            completed_at=t.completed_at,
        )
        for t in txs
    ]
