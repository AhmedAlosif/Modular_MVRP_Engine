from odfdo import Document
import tkinter as tk
from tkinter import filedialog
import zipfile
from lxml import etree

# Create a Tkinter root window (it won't be shown)
root = tk.Tk()
root.withdraw()  # Hide the root window

# Open a file dialog to select the ODS file
file_path = filedialog.askopenfilename(
    title="Select ODS file", filetypes=[("ODS files", "*.ods")])

ODS_NS = {
    'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'
}

def extract_text(cell):
    """Extract text content from a <table:table-cell> element."""
    return ''.join(cell.itertext()).strip()

def find_row_in_ods(ods_path, match_fn, trim_empty = True):
    with zipfile.ZipFile(ods_path) as zf:
        with zf.open('content.xml') as f:
            context = etree.iterparse(f, events=(
                'end',), tag='{urn:oasis:names:tc:opendocument:xmlns:table:1.0}table-row')
            for _, row in context:
                # Extract all cell values from the row
                values = []
                for cell in row.iterfind('.//table:table-cell', namespaces=ODS_NS):
                    val = extract_text(cell)
                    repeat_attr = cell.get(
                        '{urn:oasis:names:tc:opendocument:xmlns:table:1.0}number-columns-repeated')
                    repeat = int(repeat_attr) if repeat_attr else 1
                    values.extend([val] * repeat)

                if trim_empty:
                    # Remove trailing empty strings (like '', '', '', '')
                    while values and values[-1] == '':
                        values.pop()

                if match_fn(values):
                    return values

                row.clear()  # Free memory

    return None  # Not found

# Example usage
sheet_name = 'Planilha1'  # Replace with your sheet name
target_keyword = 'XML100_3376_26'  # Replace with the value you are searching for


row = find_row_in_ods(file_path, lambda r: any(
    target_keyword in str(cell) for cell in r))
if row:
    print("Found matching row:", row)
else:
    print("No matching row found.")
