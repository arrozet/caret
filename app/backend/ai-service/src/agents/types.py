"""
Shared agent type definitions for the AI service.

This module centralises the public agent slugs used by the frontend and the
streaming service so the agent registry, request schema, and UI stay aligned.
"""

from typing import Literal

AgentType = Literal["general", "translation", "summary", "research"]
