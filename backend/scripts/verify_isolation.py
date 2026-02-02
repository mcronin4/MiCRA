import os
import time
from supabase import create_client, Client
from dotenv import load_dotenv

# Load env from backend/.env
# Assuming script is run from project root or backend dir.
# Try logging absolute path just in case
print(f"Loading environment from C:\\QMIND\\MiCRA-clean\\backend\\.env")
load_dotenv(r"C:\QMIND\MiCRA-clean\backend\.env")

url = os.environ.get("SUPABASE_URL")
service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
anon_key = os.environ.get("SUPABASE_ANON_KEY")

if not url or not service_key:
    print("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.")
    exit(1)

# Admin Client (for setup/teardown)
admin_client = create_client(url, service_key)

def run_verification():
    print("--- Starting Isolation Verification ---")
    
    # 1. Create Test Users
    email_a = f"test_iso_a_{int(time.time())}@example.com"
    email_b = f"test_iso_b_{int(time.time())}@example.com"
    pwd = "password123"
    
    print(f"Creating User A: {email_a}")
    try:
        user_a = admin_client.auth.admin.create_user({
            "email": email_a, 
            "password": pwd, 
            "email_confirm": True
        })
    except Exception as e:
        print(f"Failed to create User A: {e}")
        return

    print(f"Creating User B: {email_b}")
    try:
        user_b = admin_client.auth.admin.create_user({
            "email": email_b, 
            "password": pwd, 
            "email_confirm": True
        })
    except Exception as e:
        print(f"Failed to create User B: {e}")
        # Clean up A
        admin_client.auth.admin.delete_user(user_a.user.id)
        return

    user_a_id = user_a.user.id
    user_b_id = user_b.user.id
    print(f"User A ID: {user_a_id}")
    print(f"User B ID: {user_b_id}")

    try:
        # 2. Sign In Users (to get their perspective clients)
        print("\nSigning in User A...")
        client_a = create_client(url, anon_key)
        client_a.auth.sign_in_with_password({"email": email_a, "password": pwd})
        
        print("Signing in User B...")
        client_b = create_client(url, anon_key)
        client_b.auth.sign_in_with_password({"email": email_b, "password": pwd})

        # 3. Test Files Table Isolation
        print("\n[Test 1] Files Table Isolation")
        file_path = f"users/{user_a_id}/secret.txt"
        print(f"User A inserting file record: {file_path}")
        
        try:
            res_a = client_a.table("files").insert({
                "name": "secret.txt",
                "type": "text",
                "path": file_path,
                "status": "pending",
                "content_type": "text/plain",
                "content_hash": "hash123",
                "bucket": "docs",
                # Note: We must insert our own user_id. RLS 'check' will enforce this, 
                # or default might be used if column has default auth.uid()
                "user_id": user_a_id 
            }).execute()
            print("  User A Insert: SUCCESS")
        except Exception as e:
            print(f"  User A Insert FAILED: {e}")
        
        # User B tries to read User A's file
        print("User B attempting to read User A's file...")
        res_b = client_b.table("files").select("*").eq("path", file_path).execute()
        if len(res_b.data) == 0:
            print("  User B Read: BLOCKED (Success - RLS working)")
        else:
            print(f"  User B Read: ALLOWED (Failure - RLS broken). Data: {res_b.data}")

        # 4. Test Workflows Table Isolation
        print("\n[Test 2] Workflows Table Isolation")
        wf_name = "User A Secret Workflow"
        print(f"User A inserting workflow: {wf_name}")
        
        wf_id = None
        try:
            # Insert metadata only (no workflow_data here)
            res_wf_a = client_a.table("workflows").insert({
                "name": wf_name,
                "user_id": user_a_id,
                "is_system": False
            }).execute()
            print("  User A Insert Workflow: SUCCESS")
            wf_id = res_wf_a.data[0]['id']
            
            # Insert a version for this workflow
            client_a.table("workflow_versions").insert({
                "workflow_id": wf_id,
                "payload": {"nodes": [], "edges": []},
                "version_number": 1
            }).execute()
            print("  User A Insert Workflow Version: SUCCESS")
            
        except Exception as e:
            print(f"  User A Insert FAILED: {e}")
        
        if wf_id:
            # User B tries to read A's workflow metadata
            print("User B attempting to read User A's workflow...")
            res_wf_b = client_b.table("workflows").select("*").eq("id", wf_id).execute()
            if len(res_wf_b.data) == 0:
                print("  User B Read Workflow: BLOCKED (Success - RLS working)")
            else:
                 print(f"  User B Read Workflow: ALLOWED (Failure - RLS broken). Data: {res_wf_b.data}")

            # User B tries to read A's workflow versions
            print("User B attempting to read User A's workflow versions...")
            res_ver_b = client_b.table("workflow_versions").select("*").eq("workflow_id", wf_id).execute()
            if len(res_ver_b.data) == 0:
                print("  User B Read Version: BLOCKED (Success - RLS working)")
            else:
                 print(f"  User B Read Version: ALLOWED (Failure - RLS broken). Data: {res_ver_b.data}")

    except Exception as e:
        print(f"\nVerification Script Error: {e}")
    
    finally:
        print("\n--- Teardown ---")
        print("Deleting Test Users...")
        try:
            admin_client.auth.admin.delete_user(user_a_id)
            admin_client.auth.admin.delete_user(user_b_id)
            print("Users deleted.")
        except Exception as e:
            print(f"Error deleting users: {e}")

if __name__ == "__main__":
    run_verification()
