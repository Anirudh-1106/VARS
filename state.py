class ResumeState:
    def __init__(self):
        self.data = {
            "name": None,
            "email": None,
            "phone": None,
            "linkedin": None,
            "github": None,
            "summary": None,
            "education": [],       # list of {institution, degree, year}
            "skills": [],
            "experience": [],      # list of {company, role, duration, bullets[]}
            "projects": [],        # list of {name, description, tech_stack[]}
        }

    def update(self, new_data: dict):
        for field, value in new_data.items():
            if not value:
                continue

            if field not in self.data:
                continue

            # Handle list-based fields
            if isinstance(self.data.get(field), list):
                if isinstance(value, list):
                    for item in value:
                        if item not in self.data[field]:
                            self.data[field].append(item)

            # Handle single-value fields (set once, update if explicitly provided)
            else:
                self.data[field] = value

    def get_resume_data(self):
        """Return a copy of the resume data dict for template rendering."""
        return dict(self.data)

    def missing_fields(self):
        missing = []
        for field, value in self.data.items():
            if value is None or value == []:
                missing.append(field)
        return missing