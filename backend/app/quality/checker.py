from pydantic import BaseModel, Field
from typing import List, Optional
import json
import re
import uuid
from ..llm.gemini import query_gemini
from .dictionary import DictionaryManager

class QualityFlag(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8], description="Unique identifier for the flag")
    text: str = Field(..., description="The specific text segment flagged")
    type: str = Field(..., description="Type of flag: 'spelling', 'grammar', 'brand', 'proper_noun', 'standard_term'")
    suggestion: Optional[str] = Field(None, description="Suggested correction")
    reasoning: str = Field(..., description="Why this was flagged")
    startIndex: int = Field(default=-1, description="Start position in the original text")
    endIndex: int = Field(default=-1, description="End position in the original text")
    status: str = Field(default="pending", description="Status: 'pending', 'approved', 'edited', 'regenerating'")

class QualityResponse(BaseModel):
    flags: List[QualityFlag]

class QualityChecker:
    def __init__(self):
        self.dictionary_manager = DictionaryManager()

    def check_content(self, text: str) -> List[QualityFlag]:
        # 1. Check against standard dictionary
        flags = self._check_dictionary(text)
        
        # 2. Check using LLM
        llm_flags = self._check_llm(text)
        
        # Combine flags and resolve positions
        flags.extend(llm_flags)
        
        # Ensure all flags have valid positions
        flags = self._resolve_positions(text, flags)
        
        # Remove duplicates (same text and overlapping positions)
        flags = self._deduplicate_flags(flags)
        
        return flags

    def _check_dictionary(self, text: str) -> List[QualityFlag]:
        flags = []
        standard_terms = self.dictionary_manager.get_all_terms()
        text_lower = text.lower()
        
        for incorrect, correct in standard_terms.items():
            # Use word boundary matching to avoid partial matches
            pattern = re.compile(r'\b' + re.escape(incorrect) + r'\b', re.IGNORECASE)
            
            for match in pattern.finditer(text):
                original_text = match.group()
                if original_text.lower() != correct.lower():
                    flags.append(QualityFlag(
                        text=original_text,
                        type="standard_term",
                        suggestion=correct,
                        reasoning=f"Standard term preference: '{correct}'",
                        startIndex=match.start(),
                        endIndex=match.end()
                    ))
        return flags

    def _check_llm(self, text: str) -> List[QualityFlag]:
        prompt = f"""
        You are a quality review assistant. Your job is to FLAG items for HUMAN VERIFICATION, not to correct them.

        IMPORTANT: Your knowledge may be outdated. DO NOT suggest corrections based on your knowledge of current events, 
        people's roles, or recent news. Instead, flag items for the human reviewer to verify.

        Analyze the following text and flag:

        1. **ALL Proper Nouns** (REQUIRED - flag every single one):
           - People's names (first names, last names, full names)
           - Place names (cities, countries, regions)
           - Organization names (companies, governments, institutions)
           - Title + Name combinations (e.g., "Prime Minister X", "CEO Y")
           - Flag these for VERIFICATION, not correction
           - Set suggestion to null - let the human decide

        2. **Spelling** - words that look potentially misspelled or have unusual spellings

        3. **Brand References** - company/product names that should be verified for correct capitalization/spelling

        4. **Grammar** - only flag obvious grammatical errors

        For each item, provide:
        - "text": the EXACT substring from the source text (case-sensitive, must match exactly)
        - "type": one of ["spelling", "grammar", "brand", "proper_noun"]
        - "suggestion": null (for proper nouns) OR a suggested correction (for spelling/grammar)
        - "reasoning": "Verify [name/spelling/etc]" - brief, neutral explanation

        CRITICAL RULES:
        - Flag ALL proper nouns, even common ones
        - DO NOT claim someone "is not" or "has never been" something - your knowledge may be outdated
        - For proper nouns, reasoning should be neutral like "Verify person name" or "Verify title and name"
        - When in doubt, flag it for human review

        Text to analyze:
        "{text}"
        
        Return a JSON object with format: {{"flags": [...]}}
        """
        
        try:
            response_text = query_gemini(prompt)
            # Clean up markdown code blocks if present
            clean_text = response_text.replace("```json", "").replace("```", "").strip()
            
            data = json.loads(clean_text)
            
            # Handle potential different root keys
            if "flags" in data:
                raw_flags = data["flags"]
            elif isinstance(data, list):
                raw_flags = data
            else:
                raw_flags = []
            
            # Convert to QualityFlag objects
            flags = []
            for f in raw_flags:
                try:
                    # Create flag with default positions (-1 means needs resolution)
                    flag = QualityFlag(
                        text=f.get("text", ""),
                        type=f.get("type", "spelling"),
                        suggestion=f.get("suggestion"),
                        reasoning=f.get("reasoning", "Flagged for review"),
                        startIndex=f.get("startIndex", -1),
                        endIndex=f.get("endIndex", -1)
                    )
                    if flag.text:  # Only add if text is not empty
                        flags.append(flag)
                except Exception:
                    continue
                    
            return flags
            
        except Exception as e:
            print(f"Error in LLM quality check: {e}")
            return []

    def _resolve_positions(self, text: str, flags: List[QualityFlag]) -> List[QualityFlag]:
        """Resolve startIndex and endIndex for flags that don't have them."""
        resolved_flags = []
        used_positions = set()  # Track used positions to avoid overlaps
        
        for flag in flags:
            if flag.startIndex >= 0 and flag.endIndex >= 0:
                # Already has positions, verify they're correct
                if text[flag.startIndex:flag.endIndex] == flag.text:
                    resolved_flags.append(flag)
                    used_positions.add((flag.startIndex, flag.endIndex))
                    continue
            
            # Need to find the position
            # Use case-sensitive search first
            start_idx = text.find(flag.text)
            
            if start_idx == -1:
                # Try case-insensitive search
                text_lower = text.lower()
                flag_text_lower = flag.text.lower()
                start_idx = text_lower.find(flag_text_lower)
                
                if start_idx != -1:
                    # Update the flag text to match the actual text in content
                    flag.text = text[start_idx:start_idx + len(flag.text)]
            
            if start_idx != -1:
                end_idx = start_idx + len(flag.text)
                
                # Check for position conflicts
                position = (start_idx, end_idx)
                if position not in used_positions:
                    flag.startIndex = start_idx
                    flag.endIndex = end_idx
                    resolved_flags.append(flag)
                    used_positions.add(position)
        
        return resolved_flags

    def _deduplicate_flags(self, flags: List[QualityFlag]) -> List[QualityFlag]:
        """Remove duplicate flags based on overlapping positions."""
        if not flags:
            return []
        
        # Sort by startIndex
        sorted_flags = sorted(flags, key=lambda f: f.startIndex)
        unique_flags = [sorted_flags[0]]
        
        for flag in sorted_flags[1:]:
            last_flag = unique_flags[-1]
            # Check for overlap
            if flag.startIndex >= last_flag.endIndex:
                unique_flags.append(flag)
            # If overlapping, keep the one with more specific type (prefer non-grammar)
            elif flag.type != "grammar" and last_flag.type == "grammar":
                unique_flags[-1] = flag
        
        return unique_flags
