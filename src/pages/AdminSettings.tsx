import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Settings, Loader2, CheckCircle, XCircle, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

const agentConfigSchema = z.object({
  agent_id: z.string()
    .min(1, "Agent ID is required")
    .max(100, "Agent ID must not exceed 100 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Agent ID must contain only letters, numbers, hyphens and underscores"),
  agent_name: z.string()
    .max(100, "Agent name must not exceed 100 characters")
    .optional(),
  description: z.string()
    .max(500, "Description must not exceed 500 characters")
    .optional(),
});

interface AgentConfig {
  id: string;
  agent_id: string;
  agent_name: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const AdminSettings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [configs, setConfigs] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    agent_id: "",
    agent_name: "",
    description: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    checkAdminAccess();
    fetchConfigs();
  }, []);

  const checkAdminAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: isAdmin } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'admin'
      });

      if (!isAdmin) {
        toast({
          title: "Access Denied",
          description: "You need admin privileges to access this page",
          variant: "destructive",
        });
        navigate("/dashboard");
      }
    } catch (error) {
      console.error('Error checking admin access:', error);
      navigate("/dashboard");
    }
  };

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('agent_config')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConfigs(data || []);
    } catch (error) {
      console.error('Error fetching configs:', error);
      toast({
        title: "Error",
        description: "Failed to load agent configurations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const validateForm = () => {
    try {
      agentConfigSchema.parse({
        agent_id: formData.agent_id.trim(),
        agent_name: formData.agent_name.trim() || undefined,
        description: formData.description.trim() || undefined,
      });
      setFormErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            errors[err.path[0].toString()] = err.message;
          }
        });
        setFormErrors(errors);
      }
      return false;
    }
  };

  const handleSaveConfig = async () => {
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors in the form",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Deactivate all other configs if this is the first one or user wants it active
      const shouldActivate = configs.length === 0;

      if (shouldActivate) {
        await supabase
          .from('agent_config')
          .update({ is_active: false })
          .neq('id', '00000000-0000-0000-0000-000000000000');
      }

      const { error } = await supabase
        .from('agent_config')
        .insert({
          agent_id: formData.agent_id.trim(),
          agent_name: formData.agent_name.trim() || null,
          description: formData.description.trim() || null,
          is_active: shouldActivate,
          created_by: user.id,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Agent configuration saved successfully",
      });

      setShowForm(false);
      setFormData({ agent_id: "", agent_name: "", description: "" });
      fetchConfigs();
    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save configuration",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (configId: string, currentState: boolean) => {
    try {
      if (!currentState) {
        // Deactivate all others
        await supabase
          .from('agent_config')
          .update({ is_active: false })
          .neq('id', configId);
      }

      const { error } = await supabase
        .from('agent_config')
        .update({ is_active: !currentState })
        .eq('id', configId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Agent ${!currentState ? 'activated' : 'deactivated'}`,
      });

      fetchConfigs();
    } catch (error) {
      console.error('Error toggling active state:', error);
      toast({
        title: "Error",
        description: "Failed to update configuration",
        variant: "destructive",
      });
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    if (!confirm("Are you sure you want to delete this configuration?")) return;

    try {
      const { error } = await supabase
        .from('agent_config')
        .delete()
        .eq('id', configId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Configuration deleted",
      });

      fetchConfigs();
    } catch (error) {
      console.error('Error deleting config:', error);
      toast({
        title: "Error",
        description: "Failed to delete configuration",
        variant: "destructive",
      });
    }
  };

  const handleTestAgent = async () => {
    const activeConfig = configs.find(c => c.is_active);
    if (!activeConfig) {
      toast({
        title: "No Active Agent",
        description: "Please activate an agent configuration first",
        variant: "destructive",
      });
      return;
    }

    try {
      setTesting(true);
      const { data, error } = await supabase.functions.invoke('create-voice-session', {
        body: { context: "Test connection" }
      });

      if (error) throw error;

      if (data?.signed_url) {
        toast({
          title: "Test Successful",
          description: "Agent is configured correctly and responding",
        });
      } else {
        throw new Error("No signed URL received");
      }
    } catch (error) {
      console.error('Error testing agent:', error);
      toast({
        title: "Test Failed",
        description: error instanceof Error ? error.message : "Failed to connect to agent",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/upload")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Settings className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Admin Settings</h1>
              <p className="text-sm text-muted-foreground">Configure ElevenLabs voice agents</p>
            </div>
          </div>
        </div>

        {/* Test Agent Button */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Active Agent Testing
              <Button
                onClick={handleTestAgent}
                disabled={testing || configs.every(c => !c.is_active)}
                className="gap-2"
              >
                {testing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    Test Connection
                  </>
                )}
              </Button>
            </CardTitle>
            <CardDescription>
              Test the currently active agent to ensure it's configured correctly
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Add New Configuration */}
        {showForm ? (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Add New Agent Configuration</CardTitle>
              <CardDescription>Configure a new ElevenLabs Conversational AI agent</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agent_id">
                  Agent ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="agent_id"
                  value={formData.agent_id}
                  onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
                  placeholder="e.g., my-study-assistant-agent"
                  maxLength={100}
                  className={formErrors.agent_id ? "border-destructive" : ""}
                />
                {formErrors.agent_id && (
                  <p className="text-sm text-destructive">{formErrors.agent_id}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Get your Agent ID from ElevenLabs Conversational AI dashboard
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agent_name">Agent Name (Optional)</Label>
                <Input
                  id="agent_name"
                  value={formData.agent_name}
                  onChange={(e) => setFormData({ ...formData, agent_name: e.target.value })}
                  placeholder="e.g., Study Assistant"
                  maxLength={100}
                  className={formErrors.agent_name ? "border-destructive" : ""}
                />
                {formErrors.agent_name && (
                  <p className="text-sm text-destructive">{formErrors.agent_name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe this agent's purpose..."
                  maxLength={500}
                  rows={3}
                  className={formErrors.description ? "border-destructive" : ""}
                />
                {formErrors.description && (
                  <p className="text-sm text-destructive">{formErrors.description}</p>
                )}
              </div>

              <div className="flex gap-3">
                <Button onClick={handleSaveConfig} disabled={saving} className="gap-2">
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Configuration"
                  )}
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Button onClick={() => setShowForm(true)} className="mb-6 gap-2">
            <Plus className="h-4 w-4" />
            Add New Configuration
          </Button>
        )}

        {/* Existing Configurations */}
        <Card>
          <CardHeader>
            <CardTitle>Agent Configurations</CardTitle>
            <CardDescription>
              Manage your ElevenLabs agent configurations. Only one can be active at a time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {configs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No agent configurations yet</p>
                <p className="text-sm">Add your first configuration to get started</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.map((config) => (
                    <TableRow key={config.id}>
                      <TableCell className="font-mono text-sm">{config.agent_id}</TableCell>
                      <TableCell>{config.agent_name || "-"}</TableCell>
                      <TableCell className="max-w-xs truncate">
                        {config.description || "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={config.is_active}
                            onCheckedChange={() => handleToggleActive(config.id, config.is_active)}
                          />
                          <Badge variant={config.is_active ? "default" : "secondary"}>
                            {config.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(config.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteConfig(config.id)}
                          disabled={config.is_active}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminSettings;
