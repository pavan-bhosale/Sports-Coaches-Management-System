import sys
import zipfile
import re

def parse(path):
    z = zipfile.ZipFile(path)
    s1 = z.read("xl/worksheets/sheet1.xml").decode("utf-8")
    s2 = z.read("xl/worksheets/sheet2.xml").decode("utf-8") if "xl/worksheets/sheet2.xml" in z.namelist() else ""
    rows = re.findall(r'<row r="(\d+)"', s1)
    data_rows = max(0, len(rows) - 1)
    roles = re.findall(r'<c r="C\d+"[^>]*><is><t>([^<]+)</t></is></c>', s1)
    # role in header is "Role" or "Actor Role"
    data_roles = [r for r in roles if r not in ("Actor Role", "Role")]
    print(f"data_rows:{data_rows}")
    print(f"data_roles:{','.join(data_roles)}")
    print(f"has_activity_title:{'Activity Audit Report' in s2}")

if __name__ == "__main__":
    parse(sys.argv[1])
