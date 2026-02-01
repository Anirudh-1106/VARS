class ResumeState:
    def __init__(self):
        self.data = {
            "summary": None,
            "education":None,
            "skills":[],
            "experience":[],
            "projects":[],

        }

    def update(self,new_data:dict):
        for field,value in new_data.items():
            if not value:
                continue
        
            if isinstance(self.data.get(field),list):
                for item in value:
                    if item not in self.data[field]:
                        self.data[field].append(item)

            else:
                if self.data[field] is None:
                    self.data[field] = value

    def missing_fields(self):
        missing=[]
        for field,value in self.data.items():
            if value is None or value==[]:
                missing.append(field)

        return missing

