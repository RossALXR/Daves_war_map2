import csv
import json
import os
import sys

def csv_to_json(csv_file_path, json_file_path):
    data = []
    repo_root = os.path.dirname(__file__)
    images_dir = os.path.join(repo_root, "images")

    images_by_id = {}
    if os.path.isdir(images_dir):
        for name in os.listdir(images_dir):
            if not name.lower().endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
                continue
            base = os.path.basename(name)
            # Expected: "<id>_rest-of-name.ext"
            prefix = base.split("_", 1)[0]
            try:
                stop_id = int(prefix)
            except ValueError:
                continue
            images_by_id.setdefault(stop_id, []).append(base)

        # Stable choice if multiple images exist for an id.
        for stop_id in images_by_id:
            images_by_id[stop_id].sort(key=lambda s: s.lower())

    # Read the CSV file
    with open(csv_file_path, mode='r', encoding='utf-8') as csv_file:
        csv_reader = csv.DictReader(csv_file)
        headers = csv_reader.fieldnames

        # Check if required columns exist
        required_columns = ["ID", "DATE", "PLACE", "Narrative", "CLUE"]
        for column in required_columns:
            if column not in headers:
                raise KeyError(f"Missing required column: {column}")

        # Support either X/Y (older) or x/y (newer) coordinate columns.
        has_upper_xy = ("X" in headers) and ("Y" in headers)
        has_lower_xy = ("x" in headers) and ("y" in headers)
        if not (has_upper_xy or has_lower_xy):
            raise KeyError("Missing required coordinate columns: X/Y or x/y")

        for row in csv_reader:
            stop_id = int(row["ID"])
            x_value = row["X"] if has_upper_xy else row["x"]
            y_value = row["Y"] if has_upper_xy else row["y"]

            image_name = ""
            if stop_id in images_by_id and images_by_id[stop_id]:
                image_name = f"images/{images_by_id[stop_id][0]}"

            # Convert each row into a dictionary and append to the data list
            data.append({
                "id": stop_id,
                "title": row["PLACE"],
                "subtitle": row["DATE"],
                "coords": [float(y_value), float(x_value)],
                "text": row["Narrative"],
                "caption": row["CLUE"],
                "image": image_name
            })

    # Write the data to a JSON file
    with open(json_file_path, mode='w', encoding='utf-8') as json_file:
        json.dump(data, json_file, indent=4)

if __name__ == "__main__":
    # Allow an explicit CSV path as arg1; otherwise use your default Downloads path.
    csv_file_path = sys.argv[1] if len(sys.argv) > 1 else r"C:\\Users\\rossa\\Downloads\\Daves_war_data4apr26.csv"
    json_file_path = os.path.join(os.path.dirname(__file__), 'data', 'stops4apr26.json')

    try:
        csv_to_json(csv_file_path, json_file_path)
        print(f"Data successfully converted from {csv_file_path} to {json_file_path}")
    except KeyError as e:
        print(f"Error: {e}. Please check the column names in your CSV file.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
