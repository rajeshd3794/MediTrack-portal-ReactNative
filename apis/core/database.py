import os
import requests
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip('/')
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "")

def handle_request(resp):
    try:
        resp.raise_for_status()
        return resp.json()
    except requests.exceptions.HTTPError as e:
        # If Supabase table doesn't exist, it returns 404 or 400. We gracefully return empty data.
        if resp.status_code in [404, 400]:
            return []
        raise e

class SupabaseTableProxy:
    def __init__(self, table_name: str, base_url: str, key: str):
        self.table_name = table_name
        self.endpoint = f"{base_url}/rest/v1/{table_name}"
        self.headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }
    
    def insert(self, data):
        class Action:
            def execute(self):
                resp = requests.post(self.parent.endpoint, json=data, headers=self.parent.headers)
                data_parsed = handle_request(resp)
                return type('Resp', (object,), {'data': data_parsed})()
        
        act = Action()
        act.parent = self
        return act
        
    def select(self, columns="*"):
        class Action:
            def __init__(self, parent):
                self.parent = parent
                self.params = {"select": columns}
                self.order_col = None
                self.order_desc = False
                self.eq_filters = {}
                self.or_filter = None
            
            def eq(self, column, value):
                self.eq_filters[column] = f"eq.{value}"
                return self
                
            def or_(self, filter_string):
                self.or_filter = f"({filter_string})"
                return self
                
            def order(self, column, desc=False):
                self.order_col = column
                self.order_desc = desc
                return self

            def execute(self):
                params = self.params.copy()
                for k, v in self.eq_filters.items():
                    params[k] = v
                if self.or_filter:
                    params["or"] = self.or_filter
                if self.order_col:
                    params["order"] = f"{self.order_col}.{'desc' if self.order_desc else 'asc'}"
                
                resp = requests.get(self.parent.endpoint, params=params, headers=self.parent.headers)
                data_parsed = handle_request(resp)
                return type('Resp', (object,), {'data': data_parsed})()
        return Action(self)
        
    def update(self, data):
        class Action:
            def __init__(self, parent):
                self.parent = parent
                self.or_filter = None
                self.eq_filter = None
                
            def or_(self, filter_string):
                self.or_filter = f"({filter_string})"
                return self
                
            def eq(self, column, value):
                self.eq_filter = {column: f"eq.{value}"}
                return self
                
            def execute(self):
                params = {}
                if self.or_filter:
                    params["or"] = self.or_filter
                if self.eq_filter:
                    params.update(self.eq_filter)
                
                resp = requests.patch(self.parent.endpoint, params=params, json=data, headers=self.parent.headers)
                data_parsed = handle_request(resp)
                return type('Resp', (object,), {'data': data_parsed})()
        return Action(self)
        
    def delete(self):
        class Action:
            def __init__(self, parent):
                self.parent = parent
                self.or_filter = None
                self.eq_filter = None
                
            def or_(self, filter_string):
                self.or_filter = f"({filter_string})"
                return self
                
            def eq(self, column, value):
                self.eq_filter = {column: f"eq.{value}"}
                return self
                
            def execute(self):
                params = {}
                if self.or_filter:
                    params["or"] = self.or_filter
                if self.eq_filter:
                    params.update(self.eq_filter)
                
                resp = requests.delete(self.parent.endpoint, params=params, headers=self.parent.headers)
                if resp.status_code not in [204, 404, 400]:
                    resp.raise_for_status()
                return type('Resp', (object,), {'data': []})()
        return Action(self)


class SupabaseClientMock:
    def table(self, table_name: str) -> SupabaseTableProxy:
        return SupabaseTableProxy(table_name, SUPABASE_URL, SUPABASE_KEY)

supabase = SupabaseClientMock()
