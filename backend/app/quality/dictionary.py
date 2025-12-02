import json
import os
from typing import Dict, List, Optional

DICTIONARY_FILE = "standard_dictionary.json"

class DictionaryManager:
    def __init__(self, file_path: str = DICTIONARY_FILE):
        self.file_path = file_path
        self.dictionary: Dict[str, str] = self._load_dictionary()

    def _load_dictionary(self) -> Dict[str, str]:
        if not os.path.exists(self.file_path):
            return {}
        try:
            with open(self.file_path, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {}

    def _save_dictionary(self):
        with open(self.file_path, 'w') as f:
            json.dump(self.dictionary, f, indent=2)

    def add_term(self, term: str, correction: str):
        """Add or update a standard term correction."""
        self.dictionary[term.lower()] = correction
        self._save_dictionary()

    def get_correction(self, term: str) -> Optional[str]:
        """Get the standard correction for a term if it exists."""
        return self.dictionary.get(term.lower())

    def get_all_terms(self) -> Dict[str, str]:
        return self.dictionary


