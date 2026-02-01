from flask import Flask,jsonify,render_template
from state import ResumeState
app= Flask(__name__)
resume_state=ResumeState()
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/state",methods=["GET"])
def get_missing():
    return jsonify({"missing_fields":resume_state.missing_fields()})

if __name__=="__main__":
    app.run(debug=True)



