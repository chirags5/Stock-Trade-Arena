from typing import List

from pydantic import BaseModel


class ConnectRequest(BaseModel):
    api_key: str
    client_id: str
    password: str
    totp_secret: str


class ConnectResponse(BaseModel):
    success: bool
    message: str
    session_token: str


class Holding(BaseModel):
    tradingsymbol: str
    exchange: str
    isin: str
    quantity: int
    average_price: float
    ltp: float
    pnl: float
    pnl_percentage: float


class HoldingsResponse(BaseModel):
    success: bool
    holdings: List[Holding]
    total_invested: float
    total_current_value: float
    total_pnl: float
    message: str
