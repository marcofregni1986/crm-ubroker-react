import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase
# Note: Assuming the environment has credentials or we can use the default app
# In this environment, we usually use the service account if available or default
# For safety, I'll try to initialize with default credentials
try:
    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    db = firestore.client()

    emails = ["sibap.be@gmail.com", "info@armonieimmobiliare.it"]
    results = {}

    for email in emails:
        print(f"\nSearching for: {email}")
        users_ref = db.collection("users")
        query = users_ref.where("email", "==", email).stream()
        
        found = False
        for doc in query:
            found = True
            data = doc.to_dict()
            uid = doc.id
            print(f"FOUND UID: {uid}")
            print(f"NAME: {data.get('nome')} {data.get('cognome')}")
            print(f"PHONE: {data.get('telefono')}")
            
            # Count appointments
            appts = db.collection("appointments").where("uid", "==", uid).get()
            print(f"APPOINTMENTS COUNT: {len(appts)}")
            
            # Count customers (subcollection)
            customers = db.collection("users").document(uid).collection("customers").get()
            print(f"CUSTOMERS COUNT: {len(customers)}")
            
            results[email] = {"uid": uid, "data": data, "appts": len(appts), "customers": len(customers)}

        if not found:
            print(f"NOT FOUND: {email}")

except Exception as e:
    print(f"ERROR: {e}")
