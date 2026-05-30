-- Auto-generated VC obligations (Phase 2e). Props typecheck in Lean; discharge in 2f.
import Init.Data.Float
import Core
import Discharge

open Li

namespace AutoVC

namespace route_to_dlq

def vc_route_to_dlq_requires_0 (expired : Int) : Prop := (expired ≥ 0)
def vc_route_to_dlq_ensures_0 (expired : Int) (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_route_to_dlq_ensures_0_proved (expired : Int) (result : Int) : vc_route_to_dlq_ensures_0 expired result := trivial
def vc_route_to_dlq_decreases_0 (expired : Int) : Nat := 0
theorem vc_route_to_dlq_decreases_0_proved (expired : Int) : vc_route_to_dlq_decreases_0 expired = 0 := rfl

end route_to_dlq

namespace main

def vc_main_requires_0 : Prop := True
theorem vc_main_requires_0_proved : vc_main_requires_0 := trivial
def vc_main_ensures_0 (result : Int) : Prop := True
/-! Phase 2f: return expression matches ensures (static witness) -/
theorem vc_main_ensures_0_proved (result : Int) : vc_main_ensures_0 result := trivial
def vc_main_decreases_0 : Nat := 0
theorem vc_main_decreases_0_proved : vc_main_decreases_0 = 0 := rfl
def vc_main_call0_route_to_dlq_requires_0 : Prop := True
theorem vc_main_call0_route_to_dlq_requires_0_proved : vc_main_call0_route_to_dlq_requires_0 := trivial

end main

end AutoVC
