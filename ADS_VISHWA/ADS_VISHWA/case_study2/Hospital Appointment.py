pat_name = input("Patient Name: ")

req_dept = input("Requested departments: ").split(",")
avl_dept = input("Available departments: ").split(",")
prev_dept = input("Previously visited departments: ").split(",")

pref_doc = input("Preferred doctors: ").split(",")
avl_doc = input("Available doctors: ").split(",")

emer_dept = input("Emergency departments: ").split(",")

if len(req_dept) > 0:
    first_dept = req_dept[0]
else:
    first_dept = "None"

first_two = req_dept[:2]

req_dept.append("General Checkup")

if "General Checkup" in req_dept:
    req_dept.remove("General Checkup")

if "Cardiology" in req_dept:
    cardio = "Requested"
else:
    cardio = "Not Requested"

req_set = set(req_dept)
avl_set = set(avl_dept)
prev_set = set(prev_dept)
emer_set = set(emer_dept)

avl_req = req_set.intersection(avl_set)

common = req_set.intersection(prev_set)

not_avl = req_set.difference(avl_set)

all_dept = req_set.union(avl_set)

dup = set()
seen = set()

for dept in req_dept:
    if dept in seen:
        dup.add(dept)
    else:
        seen.add(dept)

emer_need = req_set.intersection(emer_set)

pref_set = set(pref_doc)
avl_doc_set = set(avl_doc)

avl_pref_doc = pref_set.intersection(avl_doc_set)

if len(avl_req) > 0:
    rec_dept = list(avl_req)[0]
else:
    rec_dept = "No Department Available"

if len(emer_need) > 0:
    status = "Emergency Appointment"
elif len(avl_req) > 0:
    status = "Appointment Confirmed"
else:
    status = "Appointment Pending"

print("\n" + "*" * 40)
print("   HOSPITAL APPOINTMENT REPORT")
print("=" * 40)

print("Patient Name:", pat_name)

print("\nRequested Departments:", req_dept)
print("Available Departments:", avl_dept)

print("\nFirst Department:", first_dept)
print("First Two Departments:", first_two)

print("\nAvailable Requested:", list(avl_req))
print("Unavailable Departments:", list(not_avl))
print("Common Departments:", list(common))

print("\nPreviously Visited:", prev_dept)

print("Emergency Departments:", emer_dept)
print("Emergency Needed:", list(emer_need))

print("\nDuplicate Requests:", list(dup))

print("\nPreferred Doctors:", pref_doc)
print("Available Doctors:", avl_doc)
print("Available Preferred Doctors:", list(avl_pref_doc))

print("\nAll Departments:", list(all_dept))

print("\nCardiology Status:", cardio)
print("Recommended Department:", rec_dept)
print("Appointment Status:", status)

print("=" * 40)