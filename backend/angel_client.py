from __future__ import annotations

from typing import Any, Dict, List

import pyotp


class AngelOneClient:
    def __init__(self, api_key: str, client_id: str, password: str, totp_secret: str):
        self.api_key = api_key
        self.client_id = client_id
        self.password = password
        self.totp_secret = totp_secret
        self.smart_api = None
        self.jwt_token = None

    def _get_smart_connect(self):
        # Support multiple package layouts used by smartapi-python variants.
        try:
            from SmartApi import SmartConnect  # type: ignore
            return SmartConnect
        except Exception:
            try:
                from smartapi import SmartConnect  # type: ignore
                return SmartConnect
            except Exception as exc:
                raise RuntimeError(
                    "smartapi-python package is not importable in the active Python environment"
                ) from exc

    def connect(self) -> Dict[str, Any]:
        SmartConnect = self._get_smart_connect()
        self.smart_api = SmartConnect(api_key=self.api_key)

        totp = pyotp.TOTP(self.totp_secret).now()
        resp = self.smart_api.generateSession(self.client_id, self.password, totp)

        if not isinstance(resp, dict):
            raise RuntimeError("Unexpected SmartAPI response for generateSession")

        ok = bool(resp.get("status"))
        data = resp.get("data") or {}
        if not ok or not data:
            message = resp.get("message") or "AngelOne login failed"
            raise RuntimeError(message)

        self.jwt_token = data.get("jwtToken") or data.get("jwt_token") or ""
        if not self.jwt_token:
            raise RuntimeError("AngelOne session token missing in response")

        return resp

    def get_holdings(self) -> List[Dict[str, Any]]:
        if self.smart_api is None:
            raise RuntimeError("AngelOne client is not connected")

        resp = self.smart_api.holding()
        if not isinstance(resp, dict):
            raise RuntimeError("Unexpected SmartAPI response for holdings")

        if not resp.get("status"):
            message = resp.get("message") or "Unable to fetch holdings"
            raise RuntimeError(message)

        data = resp.get("data")
        if isinstance(data, list):
            return data
        return []

    def disconnect(self):
        if self.smart_api is None:
            return

        try:
            self.smart_api.terminateSession(self.client_id)
        except Exception:
            pass
