from flask import Flask, render_template, send_from_directory
import os

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:filename>')
def static_files(filename):
    return send_from_directory(os.path.join(app.root_path, 'static'), filename)

@app.route('/data/<path:filename>')
def data_files(filename):
    return send_from_directory(os.path.join(app.root_path, 'data'), filename)

@app.route('/images/<path:filename>')
def image_files(filename):
    # Support repo-root /images for local Flask preview; GitHub Pages serves it directly.
    return send_from_directory(os.path.join(app.root_path, 'images'), filename)

if __name__ == '__main__':
    app.run(debug=True)
