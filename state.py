class ResumeState:
    def __init__(self):
        self.data = {
            "name": None,
            "email": None,
            "phone": None,
            "linkedin": None,
            "github": None,
            "summary": None,
            "education": [],
            "skills": [],
            "experience": [],
            "projects": [],
        }

    def update(self, new_data: dict, replace_lists: bool = False):
        for field, value in new_data.items():
            if not value:
                continue

            if field not in self.data:
                continue

            if isinstance(self.data.get(field), list):
                if isinstance(value, list):
                    if replace_lists:
                        self.data[field] = value
                    else:
                        for item in value:
                            if item not in self.data[field]:
                                self.data[field].append(item)
            else:
                self.data[field] = value

    def missing_fields(self):
        missing=[]
        for field,value in self.data.items():
            if value is None or value==[]:
                missing.append(field)

        return missing

    def get_resume_data(self):
        """Return a copy of the resume data dict for template rendering."""
        return dict(self.data)

